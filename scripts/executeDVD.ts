import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

import { createInstances } from "../test/instance";
import { FhevmInstances } from "../test/types";

async function executeDVD() {
  const eSigners = await ethers.getSigners();
  const signers = {
    deployer: eSigners[0],
    tokenIssuer: eSigners[1],
    tokenAgent: eSigners[2],
    tokenAdmin: eSigners[3],
    claimIssuer: eSigners[4],
    aliceWallet: eSigners[5],
    bobWallet: eSigners[6],
    charlieWallet: eSigners[7],
    davidWallet: eSigners[8],
    anotherWallet: eSigners[9],
  };
  const tokenAAddress: string = process.env.TOKEN_TREX_A || "";
  const tokenBAddress: string = process.env.TOKEN_TREX_B || "";
  const transferManagerAddress: string = process.env.DVD_MANAGER || "";
  if (tokenAAddress == "" || tokenBAddress == "") {
    throw new Error("Please set your TOKEN_TREX in a .env file");
  }
  if (transferManagerAddress == "") {
    throw new Error("Please set your DVD_MANAGER in a .env file");
  }

  const instances: FhevmInstances = await createInstances(signers);
  // Define private public key
  const { publicKey: publicKeyAlice, privateKey: privateKeyAlice } = instances.aliceWallet.generateKeypair();
  const { publicKey: publicKeyBob, privateKey: privateKeyBob } = instances.bobWallet.generateKeypair();
  // Define contracts
  const tokenFactory = await ethers.getContractFactory("Token");
  const transferManagerFactory = await ethers.getContractFactory("DVDTransferManager");
  const tokenA = tokenFactory.attach(tokenAAddress);
  const tokenB = tokenFactory.attach(tokenBAddress);
  const transferManager = transferManagerFactory.attach(transferManagerAddress);
  // Get two tokens name
  const tokenAName = await tokenA.name();
  const tokenBName = await tokenB.name();
  console.log("---------------------------INITIALIZATION---------------------------");
  // Mint 1000 tokenA to Alice
  const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await tokenA.getAddress(), signers.tokenAgent.address);
  inputTokenAgent.add64(1000);
  const encryptedTransferAmount = inputTokenAgent.encrypt();
  const tx = await tokenA
    .connect(signers.tokenAgent)
    ["mint(address,bytes32,bytes)"](
      signers.aliceWallet.address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof
    );
  await tx.wait();
  const balanceAliceTokenBHandle = await tokenA.connect(signers.aliceWallet).balanceOf(signers.aliceWallet.address);
  const balanceAliceTokenB = await decryptCypher(
    publicKeyAlice,
    privateKeyAlice,
    instances.aliceWallet,
    tokenAAddress,
    signers.aliceWallet,
    balanceAliceTokenBHandle
  );
  console.log("BEFORE DVD: Alice Balance of token " + tokenAName + " : " + balanceAliceTokenB);
  // Mint 1000 tokenB to Bob
  const inputTokenAgent2 = instances.tokenAgent.createEncryptedInput(await tokenB.getAddress(), signers.tokenAgent.address);
  inputTokenAgent2.add64(1000);
  const encryptedTransferAmount2 = inputTokenAgent2.encrypt();
  const tx2 = await tokenB
    .connect(signers.tokenAgent)
    ["mint(address,bytes32,bytes)"](
      signers.bobWallet.address,
      encryptedTransferAmount2.handles[0],
      encryptedTransferAmount2.inputProof
    );
  await tx2.wait();
  const balanceBobTokenBHandle = await tokenB.connect(signers.bobWallet).balanceOf(signers.bobWallet.address);
  const balanceBobTokenB = await decryptCypher(
    publicKeyBob,
    privateKeyBob,
    instances.bobWallet,
    tokenBAddress,
    signers.bobWallet,
    balanceBobTokenBHandle
  );
  console.log("BEFORE DVD: Bob Balance of token " + tokenBName + " : " + balanceBobTokenB);
  console.log("---------------------------INITIATE DVD---------------------------");
  // Initalize the transfer
  const transferId = await initiateTransfer(instances, tokenA, tokenB, signers, transferManager);
  // Execute the transfer
  console.log("---------------------------EXECUTE DVD---------------------------");
  await executeTransfer(instances, tokenB, signers, transferManager, transferId);
  // Final balance of both parties
  console.log("---------------------------RESULTS---------------------------");
  const balanceFinalBobTokenAHandle = await tokenA.balanceOf(signers.bobWallet.address);
  const balanceFinalBobTokenA = await decryptCypher(
    publicKeyBob,
    privateKeyBob,
    instances.bobWallet,
    tokenAAddress,
    signers.bobWallet,
    balanceFinalBobTokenAHandle
  );
  console.log("AFTER DVD: Bob Balance of token " + tokenAName + ": " + balanceFinalBobTokenA);
  const balanceFinalBobTokenBHandle = await tokenB.balanceOf(signers.bobWallet.address);
  const balanceFinalBobTokenB = await decryptCypher(
    publicKeyBob,
    privateKeyBob,
    instances.bobWallet,
    tokenBAddress,
    signers.bobWallet,
    balanceFinalBobTokenBHandle
  );
  console.log("AFTER DVD: Bob Balance of token " + tokenBName + ": " + balanceFinalBobTokenB);
  const balanceFinalAliceTokenAHandle = await tokenA.balanceOf(signers.aliceWallet.address);
  const balanceFinalAliceTokenA = await decryptCypher(
    publicKeyAlice,
    privateKeyAlice,
    instances.aliceWallet,
    tokenAAddress,
    signers.aliceWallet,
    balanceFinalAliceTokenAHandle
  );
  console.log("AFTER DVD: Alice Balance of token " + tokenAName + ": " + balanceFinalAliceTokenA);
  const balanceFinalAliceTokenBHandle = await tokenB.balanceOf(signers.aliceWallet.address);
  const balanceFinalAliceTokenB = await decryptCypher(
    publicKeyAlice,
    privateKeyAlice,
    instances.aliceWallet,
    tokenBAddress,
    signers.aliceWallet,
    balanceFinalAliceTokenBHandle
  );
  console.log("AFTER DVD: Alice Balance of token " + tokenBName + ": " + balanceFinalAliceTokenB);
}

async function initiateTransfer(instances: FhevmInstances, tokenA: any, tokenB: any, signers: any, transferManager: any) {
  // Approve the usage of transfer manager of the tokenA to swap
  const inputAlice = instances.aliceWallet.createEncryptedInput(await tokenA.getAddress(), signers.aliceWallet.address);
  inputAlice.add64(1000).add64(500);
  const encryptedAmount = inputAlice.encrypt();
  const tx1 = await tokenA
    .connect(signers.aliceWallet)
    ["approve(address,bytes32,bytes)"](
      await transferManager.getAddress(),
      encryptedAmount.handles[0],
      encryptedAmount.inputProof
    );
  await tx1.wait();
  // Initiate the exchange of 1000 tokenA from Alice with 500 tokenB of Bob
  const tx2 = await transferManager
    .connect(signers.aliceWallet)
    ["initiateDVDTransfer(address,bytes32,bytes32,bytes,address,address)"](
      await tokenA.getAddress(),
      encryptedAmount.handles[0],
      encryptedAmount.handles[1],
      encryptedAmount.inputProof,
      signers.bobWallet.address,
      await tokenB.getAddress()
    );

  const txReceipt = await tx2.wait();
  return txReceipt.logs[0].topics[1];
}

async function executeTransfer(instances: FhevmInstances, tokenB: any, signers: any, transferManager: any, transferId: string) {
  // Approve the usage of transfer manager of the tokenB to swap
  const inputBob = instances.bobWallet.createEncryptedInput(await tokenB.getAddress(), signers.bobWallet.address);
  inputBob.add64(500);
  const encryptedAllowanceAmount = inputBob.encrypt();
  const tx2 = await tokenB
    .connect(signers.bobWallet)
    ["approve(address,bytes32,bytes)"](
      await transferManager.getAddress(),
      encryptedAllowanceAmount.handles[0],
      encryptedAllowanceAmount.inputProof
    );
  await tx2.wait();
  // Execute the transfer
  const tx = await transferManager.connect(signers.bobWallet).takeDVDTransfer(transferId);
  await tx.wait();
}

async function decryptCypher(
  publicKey: string,
  privateKey: string,
  instance: FhevmInstances,
  contractAddress: string,
  signer: HardhatEthersSigner,
  balanceHandle: any
) {
  const eip712 = instance.createEIP712(publicKey, contractAddress);
  const signature = await signer.signTypedData(eip712.domain, { Reencrypt: eip712.types.Reencrypt }, eip712.message);
  return await instance.reencrypt(
    balanceHandle,
    privateKey,
    publicKey,
    signature.replace("0x", ""),
    contractAddress,
    signer.address
  );
}

executeDVD().catch((error) => console.log(error));
