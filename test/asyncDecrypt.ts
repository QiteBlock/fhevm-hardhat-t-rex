import dotenv from "dotenv";
import fs from "fs";
import { ethers } from "hardhat";

import { GatewayContract } from "../types";
import { waitNBlocks } from "./utils";

const network = process.env.HARDHAT_NETWORK;

const currentTime = (): string => {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "numeric", second: "numeric" });
};

const parsedEnv = dotenv.parse(fs.readFileSync("node_modules/fhevm/gateway/.env.gateway"));
const privKeyRelayer = process.env.PRIVATE_KEY_GATEWAY_RELAYER;
const relayer = new ethers.Wallet(privKeyRelayer!, ethers.provider);

const argEvents =
  "(uint256 indexed requestID, uint256[] cts, address contractCaller, bytes4 callbackSelector, uint256 msgValue, uint256 maxTimestamp, bool passSignaturesToCaller)";
const ifaceEventDecryption = new ethers.Interface(["event EventDecryption" + argEvents]);

const argEvents2 = "(uint256 indexed requestID, bool success, bytes result)";
const ifaceResultCallback = new ethers.Interface(["event ResultCallback" + argEvents2]);

let gateway: GatewayContract;
let firstBlockListening: number;

export const asyncDecrypt = async (): Promise<void> => {
  firstBlockListening = await ethers.provider.getBlockNumber();
  // this function will emit logs for every request and fulfilment of a decryption
  gateway = await ethers.getContractAt("GatewayContract", parsedEnv.GATEWAY_CONTRACT_PREDEPLOY_ADDRESS);
  gateway.on(
    "EventDecryption",
    async (requestID, cts, contractCaller, callbackSelector, msgValue, maxTimestamp, eventData) => {
      const blockNumber = eventData.log.blockNumber;
      console.log(`${await currentTime()} - Requested decrypt on block ${blockNumber} (requestID ${requestID})`);
    },
  );
  gateway.on("ResultCallback", async (requestID, success, result, eventData) => {
    const blockNumber = eventData.log.blockNumber;
    console.log(`${await currentTime()} - Fulfilled decrypt on block ${blockNumber} (requestID ${requestID})`);
  });
};

export const awaitAllDecryptionResults = async (): Promise<void> => {
  gateway = await ethers.getContractAt("GatewayContract", parsedEnv.GATEWAY_CONTRACT_PREDEPLOY_ADDRESS);
  await fulfillAllPastRequestsIds(network === "hardhat");
  firstBlockListening = await ethers.provider.getBlockNumber();
};

const getAlreadyFulfilledDecryptions = async (): Promise<[bigint]> => {
  let results = [];
  const eventDecryptionResult = await gateway.filters.ResultCallback().getTopicFilter();
  const filterDecryptionResult = {
    address: process.env.GATEWAY_CONTRACT_PREDEPLOY_ADDRESS,
    fromBlock: firstBlockListening,
    toBlock: "latest",
    topics: eventDecryptionResult,
  };
  const pastResults = await ethers.provider.getLogs(filterDecryptionResult);
  results = results.concat(pastResults.map((result) => ifaceResultCallback.parseLog(result).args[0]));

  return results;
};

const fulfillAllPastRequestsIds = async (mocked: boolean) => {
  const eventDecryption = await gateway.filters.EventDecryption().getTopicFilter();
  const results = await getAlreadyFulfilledDecryptions();
  const filterDecryption = {
    address: process.env.GATEWAY_CONTRACT_PREDEPLOY_ADDRESS,
    fromBlock: firstBlockListening,
    toBlock: "latest",
    topics: eventDecryption,
  };
  const pastRequests = await ethers.provider.getLogs(filterDecryption);
  for (const request of pastRequests) {
    const event = ifaceEventDecryption.parseLog(request);
    const requestID = event.args[0];
    const cts = event.args[1];
    const handles = cts.map((ct) => ct[0]);
    const typesEnum = cts.map((ct) => ct[1]);
    const msgValue = event.args[4];
    if (!results.includes(requestID)) {
      // if request is not already fulfilled
      if (mocked) {
        // in mocked mode, we trigger the decryption fulfillment manually
        const types = typesEnum.map((num) => CiphertextType[num]);
        const values = handles.map((handle, index) => (typesEnum[index] === 7n ? handle.toString(16) : handle));
        const calldata = ethers.AbiCoder.defaultAbiCoder().encode(types, values);
        const tx = await gateway.connect(relayer).fulfillRequest(requestID, calldata, { value: msgValue });
        await tx.wait();
      } else {
        // in fhEVM mode we must wait until the gateway service relayer submits the decryption fulfillment tx
        await waitNBlocks(1);
        await fulfillAllPastRequestsIds(mocked);
      }
    }
  }
};
