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

    // Need to deploy the two T-REX suite token to able to test
    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    const contextB = await deployFullSuiteFixture(ethers, signers, "TREXB", "TREXB");
    instances = await createInstances(signers);

    // Mint some token for Alice on the tokenA
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

    // Mint some token for Bob on the tokenA
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

        // Need to approve the DvD contract to be able to transfer token from Alice
        const inputAlice = instances.aliceWallet.createEncryptedInput(
          await contextTokenA.suite.token.getAddress(),
          contextTokenA.accounts.signers.aliceWallet.address
        );
        inputAlice.add64(1000).add64(500);
        const encryptedAmount = inputAlice.encrypt();
        const tx1 = await contextTokenA.suite.token
          .connect(contextTokenA.accounts.signers.aliceWallet)
          ["approve(address,bytes32,bytes)"](
            await transferManager.getAddress(),
            encryptedAmount.handles[0],
            encryptedAmount.inputProof
          );
        await tx1.wait();
        // Call initiate transfer (There is no transfer for now)
        const tx2 = await transferManager
          .connect(contextTokenA.accounts.signers.aliceWallet)
          ["initiateDVDTransfer(address,bytes32,bytes32,bytes,address,address)"](
            await contextTokenA.suite.token.getAddress(),
            encryptedAmount.handles[0],
            encryptedAmount.handles[1],
            encryptedAmount.inputProof,
            contextTokenA.accounts.signers.bobWallet.address,
            await contextTokenB.suite.token.getAddress()
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

        // Mint some tokenB for Bob
        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await contextTokenB.suite.token.getAddress(),
          contextTokenB.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(500);
        const encryptedAmount = inputTokenAgent.encrypt();
        const tx1 = await contextTokenB.suite.token
          .connect(contextTokenB.accounts.signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](
            contextTokenB.accounts.signers.bobWallet.address,
            encryptedAmount.handles[0],
            encryptedAmount.inputProof
          );
        await tx1.wait();

        // Same Bob need to approve the DvD contract to use his token
        const tx2 = await contextTokenB.suite.token
          .connect(contextTokenA.accounts.signers.bobWallet)
          ["approve(address,bytes32,bytes)"](
            await transferManager.getAddress(),
            encryptedAmount.handles[0],
            encryptedAmount.inputProof
          );
        await tx2.wait();

        // Execute the DvD
        const tx = await transferManager.connect(contextTokenA.accounts.signers.bobWallet).takeDVDTransfer(transferId);
        await expect(tx).to.emit(transferManager, "DVDTransferExecuted").withArgs(transferId);

        // Verify the final balance of Bob and Alice
        const balanceFinalBobTokenAHandle = await contextTokenA.suite.token.balanceOf(
          contextTokenA.accounts.signers.bobWallet.address
        );
        const balanceFinalBobTokenA = await decrypt64(balanceFinalBobTokenAHandle);
        // Bob has 1500 tokenA because, initially he has 500 and Alice transfer 1000 to him
        expect(balanceFinalBobTokenA).to.be.eq(1500);
        const balanceFinalBobTokenBHandle = await contextTokenB.suite.token.balanceOf(
          contextTokenB.accounts.signers.bobWallet.address
        );
        const balanceFinalBobTokenB = await decrypt64(balanceFinalBobTokenBHandle);
        // Bob has 0 tokenB because he transfer all to Alice
        expect(balanceFinalBobTokenB).to.be.eq(0);
        const balanceFinalAliceTokenBHandle = await contextTokenB.suite.token.balanceOf(
          contextTokenB.accounts.signers.aliceWallet.address
        );
        const balanceFinalAliceTokenB = await decrypt64(balanceFinalAliceTokenBHandle);
        // Alice has 500 tokenB because Bob transfer 500 tokenB to Alice
        expect(balanceFinalAliceTokenB).to.be.eq(500);
      });
    });
  });
});
