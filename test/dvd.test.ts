import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { deployFullSuiteFixture } from "./fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "./instance";
import { Signers, getSigners, initSigners } from "./signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;
let transferId: string;

describe("DVDTransferManager", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    const contextB = await deployFullSuiteFixture(ethers, signers, "TREXB", "TREXB");
    instances = await createInstances(signers);

    const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
      await context.suite.token.getAddress(),
      signers.tokenAgent.address
    );
    inputTokenAgent.add64(1000);
    const encryptedTransferAmount = inputTokenAgent.encrypt();
    const tx = await context.suite.token
      .connect(signers.tokenAgent)
      ["mint(address,bytes32,bytes)"](
        signers.aliceWallet.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );
    await tx.wait();

    const inputTokenAgent2 = instances.tokenAgent.createEncryptedInput(
      await context.suite.token.getAddress(),
      signers.tokenAgent.address
    );
    inputTokenAgent2.add64(500);
    const encryptedTransferAmount2 = inputTokenAgent2.encrypt();
    const tx2 = await context.suite.token
      .connect(signers.tokenAgent)
      ["mint(address,bytes32,bytes)"](
        signers.bobWallet.address,
        encryptedTransferAmount2.handles[0],
        encryptedTransferAmount2.inputProof
      );
    await tx2.wait();
    const transferManager = await ethers.deployContract("DVDTransferManager");
    await transferManager.waitForDeployment();

    globalContext = {
      transferManager,
      contextTokenA: {
        ...context,
        suite: {
          ...context.suite,
        },
      },
      contextTokenB: {
        ...contextB,
        suite: {
          ...contextB.suite,
        },
      },
    };
  });

  describe(".initiateDVDTransfer()", () => {
    describe("when transfer condition are met", () => {
      it("should store an initiated transfer", async () => {
        const { contextTokenA, contextTokenB, transferManager } = globalContext;

        const inputAlice = instances.aliceWallet.createEncryptedInput(
          await contextTokenA.suite.token.getAddress(),
          contextTokenA.accounts.signers.aliceWallet.address
        );
        inputAlice.add64(1000);
        const encryptedAllowanceAmount = inputAlice.encrypt();
        const tx1 = await contextTokenA.suite.token
          .connect(contextTokenA.accounts.signers.aliceWallet)
          ["approve(address,bytes32,bytes)"](
            await transferManager.getAddress(),
            encryptedAllowanceAmount.handles[0],
            encryptedAllowanceAmount.inputProof
          );
        await tx1.wait();

        const inputAlice1 = instances.aliceWallet.createEncryptedInput(
          await contextTokenA.suite.token.getAddress(),
          contextTokenA.accounts.signers.aliceWallet.address
        );
        inputAlice1.add64(1000);
        const encryptedInitTransfer = inputAlice1.encrypt();
        const inputBob = instances.bobWallet.createEncryptedInput(
          await contextTokenB.suite.token.getAddress(),
          contextTokenB.accounts.signers.bobWallet.address
        );
        inputBob.add64(500);
        const encryptedInitTransfer2 = inputBob.encrypt();
        const tx2 = await transferManager
          .connect(contextTokenA.accounts.signers.aliceWallet)
          .initiateDVDTransfer(
            await contextTokenA.suite.token.getAddress(),
            encryptedInitTransfer.handles[0],
            encryptedInitTransfer.inputProof,
            contextTokenA.accounts.signers.bobWallet.address,
            await contextTokenB.suite.token.getAddress(),
            encryptedInitTransfer2.handles[0],
            encryptedInitTransfer2.inputProof
          );

        const txReceipt = await tx2.wait();
        transferId = txReceipt.logs[0].topics[1];
      });
    });
  });
  describe(".takeDVDTransfer()", () => {
    describe("when sender is the counterpart and transfer has no fees", () => {
      it("should execute the transfer", async () => {
        const { transferManager, contextTokenA, contextTokenB } = globalContext;

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await contextTokenB.suite.token.getAddress(),
          contextTokenB.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(500);
        const encryptedMintAmount = inputTokenAgent.encrypt();
        const tx1 = await contextTokenB.suite.token
          .connect(contextTokenB.accounts.signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](
            contextTokenB.accounts.signers.bobWallet.address,
            encryptedMintAmount.handles[0],
            encryptedMintAmount.inputProof
          );
        await tx1.wait();

        const inputBob = instances.bobWallet.createEncryptedInput(
          await contextTokenB.suite.token.getAddress(),
          contextTokenB.accounts.signers.bobWallet.address
        );
        inputBob.add64(500);
        const encryptedAllowanceAmount = inputBob.encrypt();
        const tx2 = await contextTokenB.suite.token
          .connect(contextTokenA.accounts.signers.bobWallet)
          ["approve(address,bytes32,bytes)"](
            await transferManager.getAddress(),
            encryptedAllowanceAmount.handles[0],
            encryptedAllowanceAmount.inputProof
          );
        await tx2.wait();

        const tx = await transferManager.connect(contextTokenA.accounts.signers.bobWallet).takeDVDTransfer(transferId);
        await expect(tx).to.emit(transferManager, "DVDTransferExecuted").withArgs(transferId);

        const balanceFinalBobTokenAHandle = await contextTokenA.suite.token.balanceOf(
          contextTokenA.accounts.signers.bobWallet.address
        );
        const balanceFinalBobTokenA = await decrypt64(balanceFinalBobTokenAHandle);
        expect(balanceFinalBobTokenA).to.be.eq(1500);
        const balanceFinalBobTokenBHandle = await contextTokenB.suite.token.balanceOf(
          contextTokenB.accounts.signers.bobWallet.address
        );
        const balanceFinalBobTokenB = await decrypt64(balanceFinalBobTokenBHandle);
        expect(balanceFinalBobTokenB).to.be.eq(0);
        const balanceFinalAliceTokenBHandle = await contextTokenB.suite.token.balanceOf(
          contextTokenB.accounts.signers.aliceWallet.address
        );
        const balanceFinalAliceTokenB = await decrypt64(balanceFinalAliceTokenBHandle);
        expect(balanceFinalAliceTokenB).to.be.eq(500);
      });
    });
  });
});
