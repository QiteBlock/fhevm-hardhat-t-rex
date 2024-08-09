import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import {
  deployFullSuiteFixture,
  deploySuiteWithModularCompliancesFixture,
} from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("ClaimTopicsRegistry", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const { compliance, complianceBeta } = await deploySuiteWithModularCompliancesFixture(
      ethers,
      await context.authorities.trexImplementationAuthority.getAddress()
    );

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

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        complianceBeta,
      },
    };
  });

  describe(".init", () => {
    describe("when contract was already initialized", () => {
      it("should revert", async () => {
        const {
          suite: { claimTopicsRegistry },
        } = globalContext;

        await expect(claimTopicsRegistry.init()).to.be.revertedWith("Initializable: contract is already initialized");
      });
    });
  });

  describe(".addClaimTopic", () => {
    describe("when sender is not owner", () => {
      it("should revert", async () => {
        const {
          suite: { claimTopicsRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(claimTopicsRegistry.connect(signers.anotherWallet).addClaimTopic(1)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when sender is owner", () => {
      describe("when topic array contains more than 14 elements", () => {
        it("should revert", async () => {
          const {
            suite: { claimTopicsRegistry },
            accounts: { signers },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          await Promise.all(Array.from({ length: 14 }, (_, i) => i).map((i) => claimTopicsRegistry.addClaimTopic(i)));

          await expect(claimTopicsRegistry.connect(signers.deployer).addClaimTopic(14)).to.be.revertedWith(
            "cannot require more than 15 topics"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when adding a topic that is already added", () => {
        it("should revert", async () => {
          const {
            suite: { claimTopicsRegistry },
            accounts: { signers },
          } = globalContext;
          let snapshotId = await ethers.provider.send("evm_snapshot");

          await claimTopicsRegistry.addClaimTopic(1);

          await expect(claimTopicsRegistry.connect(signers.deployer).addClaimTopic(1)).to.be.revertedWith(
            "claimTopic already exists"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".removeClaimTopic", () => {
    describe("when sender is not owner", () => {
      it("should revert", async () => {
        const {
          suite: { claimTopicsRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(claimTopicsRegistry.connect(signers.anotherWallet).removeClaimTopic(1)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when sender is owner", () => {
      it("should remove claim topic", async () => {
        const {
          suite: { claimTopicsRegistry },
          accounts: { signers },
        } = globalContext;

        let snapshotId = await ethers.provider.send("evm_snapshot");
        await claimTopicsRegistry.addClaimTopic(1);
        await claimTopicsRegistry.addClaimTopic(2);
        await claimTopicsRegistry.addClaimTopic(3);

        const tx = await claimTopicsRegistry.connect(signers.deployer).removeClaimTopic(2);
        await expect(tx).to.emit(claimTopicsRegistry, "ClaimTopicRemoved").withArgs(2);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });
});
