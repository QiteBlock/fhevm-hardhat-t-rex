import { ethers } from "hardhat";

import { createInstances, decrypt64 } from "../test/instance";
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
  const balanceAliceTokenB = await decrypt64(balanceAliceTokenBHandle);
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
  const balanceBobTokenB = await decrypt64(balanceBobTokenBHandle);
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
  const balanceFinalBobTokenA = await decrypt64(balanceFinalBobTokenAHandle);
  console.log("AFTER DVD: Bob Balance of token " + tokenAName + ": " + balanceFinalBobTokenA);
  const balanceFinalBobTokenBHandle = await tokenB.balanceOf(signers.bobWallet.address);
  const balanceFinalBobTokenB = await decrypt64(balanceFinalBobTokenBHandle);
  console.log("AFTER DVD: Bob Balance of token " + tokenBName + ": " + balanceFinalBobTokenB);
  const balanceFinalAliceTokenAHandle = await tokenA.balanceOf(signers.aliceWallet.address);
  const balanceFinalAliceTokenA = await decrypt64(balanceFinalAliceTokenAHandle);
  console.log("AFTER DVD: Alice Balance of token " + tokenAName + ": " + balanceFinalAliceTokenA);
  const balanceFinalAliceTokenBHandle = await tokenB.balanceOf(signers.aliceWallet.address);
  const balanceFinalAliceTokenB = await decrypt64(balanceFinalAliceTokenBHandle);
  console.log("AFTER DVD: Alice Balance of token " + tokenBName + ": " + balanceFinalAliceTokenB);
}

async function initiateTransfer(instances: FhevmInstances, tokenA: any, tokenB: any, signers: any, transferManager: any) {
  // Approve the usage of transfer manager of the tokenA to swap
  const inputAlice = instances.aliceWallet.createEncryptedInput(await tokenA.getAddress(), signers.aliceWallet.address);
  inputAlice.add64(1000);
  const encryptedAllowanceAmount = inputAlice.encrypt();
  const tx1 = await tokenA
    .connect(signers.aliceWallet)
    ["approve(address,bytes32,bytes)"](
      await transferManager.getAddress(),
      encryptedAllowanceAmount.handles[0],
      encryptedAllowanceAmount.inputProof
    );
  await tx1.wait();
  // Initiate the exchange of 1000 tokenA from Alice with 500 tokenB of Bob
  const inputAlice1 = instances.aliceWallet.createEncryptedInput(await tokenA.getAddress(), signers.aliceWallet.address);
  inputAlice1.add64(1000);
  const encryptedInitTransfer = inputAlice1.encrypt();
  const inputBob = instances.bobWallet.createEncryptedInput(await tokenB.getAddress(), signers.bobWallet.address);
  inputBob.add64(500);
  const encryptedInitTransfer2 = inputBob.encrypt();
  const tx2 = await transferManager
    .connect(signers.aliceWallet)
    .initiateDVDTransfer(
      await tokenA.getAddress(),
      encryptedInitTransfer.handles[0],
      encryptedInitTransfer.inputProof,
      signers.bobWallet.address,
      await tokenB.getAddress(),
      encryptedInitTransfer2.handles[0],
      encryptedInitTransfer2.inputProof
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

executeDVD().catch((error) => console.log(error));
