import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import {
  deployFullSuiteFixture,
  deploySuiteWithModularCompliancesFixture,
} from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Token - Recovery", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const { compliance, complianceBeta } = await deploySuiteWithModularCompliancesFixture(
      ethers,
      await context.authorities.trexImplementationAuthority.getAddress()
    );

    const inputtokenAgent = instances.tokenAgent.createEncryptedInput(
      await context.suite.token.getAddress(),
      signers.tokenAgent.address
    );
    inputtokenAgent.add64(1000);
    const encryptedTransferAmount = inputtokenAgent.encrypt();
    const tx = await context.suite.token
      .connect(signers.tokenAgent)
      ["mint(address,bytes32,bytes)"](
        signers.aliceWallet.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );
    await tx.wait();

    const inputtokenAgent2 = instances.tokenAgent.createEncryptedInput(
      await context.suite.token.getAddress(),
      signers.tokenAgent.address
    );
    inputtokenAgent2.add64(500);
    const encryptedTransferAmount2 = inputtokenAgent2.encrypt();
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
  describe(".recoveryAddress()", () => {
    describe("when sender is not an agent", () => {
      it("should reverts", async () => {
        const {
          suite: { token },
          accounts: { signers },
          identities: { bobIdentity },
        } = globalContext;
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const AbiCoder = new ethers.AbiCoder();
        await bobIdentity
          .connect(signers.bobWallet)
          .addKey(ethers.keccak256(AbiCoder.encode(["address"], [signers.anotherWallet.address])), 1, 1);
        await ethers.provider.send("evm_revert", [snapshotId]);
        await expect(
          token
            .connect(signers.anotherWallet)
            .recoveryAddress(signers.bobWallet.address, signers.anotherWallet.address, await bobIdentity.getAddress())
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is an agent", () => {
      describe("when wallet to recover has no balance", () => {
        it("should revert", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          const balanceHandle = await token.balanceOf(signers.bobWallet.address);
          const balance = await decrypt64(balanceHandle);
          const inputBob = instances.bobWallet.createEncryptedInput(
            await token.getAddress(),
            signers.bobWallet.address
          );
          inputBob.add64(balance);
          const encryptedTransferAmount = inputBob.encrypt();
          const tx = await token
            .connect(signers.bobWallet)
            ["transfer(address,bytes32,bytes)"](
              signers.aliceWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when new wallet is not authorized on the identity", () => {
        it("should revert", async () => {
          const {
            suite: { token },
            accounts: { signers },
            identities: { bobIdentity },
          } = globalContext;
          try {
            const bobIdentityA = await bobIdentity.getAddress();
            await token
              .connect(signers.tokenAgent)
              .recoveryAddress(signers.bobWallet.address, signers.anotherWallet.address, bobIdentityA);
          } catch (error) {
            expect(error.message).to.include("Recovery not possible");
          }
        });
      });

      describe("when wallet is frozen", () => {
        it("should recover and freeze the new wallet", async () => {
          const {
            suite: { token },
            accounts: { signers },
            identities: { bobIdentity },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          const AbiCoder = new ethers.AbiCoder();
          await bobIdentity
            .connect(signers.bobWallet)
            .addKey(ethers.keccak256(AbiCoder.encode(["address"], [signers.anotherWallet.address])), 1, 1);

          await token.connect(signers.tokenAgent).setAddressFrozen(signers.bobWallet.address, true);
          // Mandatory because the contract don't have access to _frozenTokens[_lostWallet]
          const inputAgent = instances.tokenAgent.createEncryptedInput(
            await token.getAddress(),
            signers.tokenAgent.address
          );
          inputAgent.add64(BigInt(0));
          const encryptedFreezeAmount = inputAgent.encrypt();
          const t1 = await token
            .connect(signers.tokenAgent)
            ["freezePartialTokens(address,bytes32,bytes)"](
              signers.bobWallet.address,
              encryptedFreezeAmount.handles[0],
              encryptedFreezeAmount.inputProof
            );
          await t1.wait();

          const tx = await token
            .connect(signers.tokenAgent)
            .recoveryAddress(signers.bobWallet.address, signers.anotherWallet.address, await bobIdentity.getAddress());
          await tx.wait();
          const isFrozen = await token.isFrozen(signers.anotherWallet.address);
          expect(isFrozen).to.be.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when wallet has frozen token", () => {
        it("should recover and freeze tokens on the new wallet", async () => {
          const {
            suite: { token },
            accounts: { signers },
            identities: { bobIdentity },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          const AbiCoder = new ethers.AbiCoder();
          await bobIdentity
            .connect(signers.bobWallet)
            .addKey(ethers.keccak256(AbiCoder.encode(["address"], [signers.anotherWallet.address])), 1, 1);

          const inputAgent = instances.tokenAgent.createEncryptedInput(
            await token.getAddress(),
            signers.tokenAgent.address
          );
          inputAgent.add64(BigInt(50));
          const encryptedFreezeAmount = inputAgent.encrypt();
          const t1 = await token
            .connect(signers.tokenAgent)
            ["freezePartialTokens(address,bytes32,bytes)"](
              signers.bobWallet.address,
              encryptedFreezeAmount.handles[0],
              encryptedFreezeAmount.inputProof
            );
          const txReceipt = await t1.wait();

          const tx = await token
            .connect(signers.tokenAgent)
            .recoveryAddress(signers.bobWallet.address, signers.anotherWallet.address, await bobIdentity.getAddress());
          await tx.wait();
          const frozenHandle = await token.getFrozenTokens(signers.anotherWallet.address);
          const frozen = await decrypt64(frozenHandle);
          expect(frozen).to.be.equal(50);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
});
