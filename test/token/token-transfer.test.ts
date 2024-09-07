import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;
let moduleCountry: any;

describe("Token - Transfers", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const { compliance, complianceBeta } = await deploySuiteWithModularCompliancesFixture(
      ethers,
      await context.authorities.trexImplementationAuthority.getAddress()
    );

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        complianceBeta,
      },
    };
  });

  describe(".mint", () => {
    describe("when sender is an agent", () => {
      it("should mint to Alice", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputTokenAgent.add64(1000);
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        const tx = await token
          .connect(signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandle = await token.balanceOf(signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(1000);
      });
    });

    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        try {
          const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await token
            .connect(signers.aliceWallet)
            ["mint(address,bytes32,bytes)"](
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("AgentRole: caller does not have the Agent role");
        }
      });
    });

    describe("when recipient identity is not verified", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        try {
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
          inputTokenAgent.add64(100);
          const encryptedTransferAmount = inputTokenAgent.encrypt();
          const tx = await token
            .connect(signers.tokenAgent)
            ["mint(address,bytes32,bytes)"](
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("Identity is not verified.");
        }
      });
    });

    describe("when the mint breaks compliance rules", () => {
      it("should revert", async () => {
        const {
          suite: { token, compliance },
          accounts: { signers },
        } = globalContext;

        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);
        const complianceModuleA = await ethers.deployContract("CountryAllowModule");
        await complianceModuleA.waitForDeployment();
        moduleCountry = complianceModuleA;
        await compliance.addModule(await complianceModuleA.getAddress());
        await token.setCompliance(await compliance.getAddress());

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputTokenAgent.add64(100);
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        const tx = await token
          .connect(signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        expect(balanceAfter).to.equal(balance);
      });
    });
  });

  describe(".approve()", () => {
    it("should approve a contract to spend a certain amount of tokens", async () => {
      const {
        suite: { token },
        accounts: { signers },
      } = globalContext;
      const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
      inputAlice.add64(100);
      const encryptedAllowanceAmount = inputAlice.encrypt();
      const tx = await token
        .connect(signers.aliceWallet)
        ["approve(address,bytes32,bytes)"](
          signers.anotherWallet.address,
          encryptedAllowanceAmount.handles[0],
          encryptedAllowanceAmount.inputProof
        );
      const t2 = await tx.wait();
      expect(t2?.status).to.eq(1);
      const allowanceHandle = await token.allowance(signers.aliceWallet.address, signers.anotherWallet.address);
      const allowance = await decrypt64(allowanceHandle);
      expect(allowance).to.be.equal(100);
    });
  });

  describe(".increaseAllowance()", () => {
    it("should increase the allowance of a contract to spend a certain amount of tokens", async () => {
      const {
        suite: { token },
        accounts: { signers },
      } = globalContext;

      const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
      inputAlice.add64(100);
      const encryptedAllowanceAmount = inputAlice.encrypt();
      await (
        await token
          .connect(signers.aliceWallet)
          ["increaseAllowance(address,bytes32,bytes)"](
            signers.anotherWallet.address,
            encryptedAllowanceAmount.handles[0],
            encryptedAllowanceAmount.inputProof
          )
      ).wait();
      const allowanceHandle = await token.allowance(signers.aliceWallet.address, signers.anotherWallet.address);
      const allowance = await decrypt64(allowanceHandle);
      await expect(allowance).to.be.equal(200);
    });
  });

  describe(".decreaseAllowance()", () => {
    it("should decrease the allowance of a contract to spend a certain amount of tokens", async () => {
      const {
        suite: { token },
        accounts: { signers },
      } = globalContext;

      const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
      inputAlice.add64(200);
      const encryptedAllowanceAmount = inputAlice.encrypt();
      await (
        await token
          .connect(signers.aliceWallet)
          ["decreaseAllowance(address,bytes32,bytes)"](
            signers.anotherWallet.address,
            encryptedAllowanceAmount.handles[0],
            encryptedAllowanceAmount.inputProof
          )
      ).wait();
      const allowanceHandle = await token.allowance(signers.aliceWallet.address, signers.anotherWallet.address);
      const allowance = await decrypt64(allowanceHandle);
      await expect(allowance).to.be.equal(0);
    });
  });

  describe(".transfer()", () => {
    describe("when the token is paused", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        await token.connect(signers.tokenAgent).pause();
        try {
          await token.connect(signers.aliceWallet).transfer(signers.bobWallet.address, 100);
        } catch (error) {
          expect(error.message).to.include("Pausable: paused");
        } finally {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
      });
    });

    describe("when the recipient balance is frozen", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        await token.connect(signers.tokenAgent).setAddressFrozen(signers.bobWallet.address, true);

        try {
          const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await token
            .connect(signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("wallet is frozen");
        } finally {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
      });
    });

    describe("when the sender balance is frozen", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        await token.connect(signers.tokenAgent).setAddressFrozen(signers.aliceWallet.address, true);

        try {
          const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await token
            .connect(signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("wallet is frozen");
        } finally {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
      });
    });

    describe("when the sender has not enough balance", () => {
      it("should not transfer any tokens", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(balance + BigInt(100));
        const encryptedTransferAmount = inputAlice.encrypt();
        const tx = await token
          .connect(signers.aliceWallet)
          ["transfer(address,bytes32,bytes)"](
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance);
      });
    });

    describe("when the sender has not enough balance unfrozen", () => {
      it("should not transfer any tokens", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);
        const inputAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputAgent.add64(BigInt(100));
        const encryptedFreezeAmount = inputAgent.encrypt();
        const t1 = await token
          .connect(signers.tokenAgent)
          ["freezePartialTokens(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedFreezeAmount.handles[0],
            encryptedFreezeAmount.inputProof
          );
        await t1.wait();
        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(balance);
        const encryptedTransferAmount = inputAlice.encrypt();
        const tx = await token
          .connect(signers.aliceWallet)
          ["transfer(address,bytes32,bytes)"](
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance);
      });
    });

    describe("when the recipient identity is not verified", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        try {
          const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await token
            .connect(signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("Transfer not possible");
        }
      });
    });

    describe("when the transfer breaks compliance rules country not allowed", () => {
      it("should not transfer any tokens", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(100);
        const encryptedTransferAmount = inputAlice.encrypt();
        const tx = await token
          .connect(signers.aliceWallet)
          ["transfer(address,bytes32,bytes)"](
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        expect(balanceAfter).to.equal(balance);
      });
    });

    describe("when the transfer is compliant", () => {
      it("should transfer tokens", async () => {
        const {
          suite: { token, compliance },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);
        await compliance.callModuleFunction(
          new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData("addAllowedCountry", [666]),
          await moduleCountry.getAddress()
        );

        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(100);
        const encryptedTransferAmount = inputAlice.encrypt();
        const tx = await token
          .connect(signers.aliceWallet)
          ["transfer(address,bytes32,bytes)"](
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance - BigInt(100));
      });
    });
  });

  describe(".batchTransfer()", () => {
    it("should transfer tokens", async () => {
      const {
        suite: { token, compliance },
        accounts: { signers },
      } = globalContext;
      const snapshotId = await ethers.provider.send("evm_snapshot");
      const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
      const balance = await decrypt64(balanceHandle);
      await compliance.callModuleFunction(
        new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData("addAllowedCountry", [666]),
        await moduleCountry.getAddress()
      );
      const inputAlice1 = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
      const addresses = [signers.bobWallet.address, signers.bobWallet.address];
      inputAlice1.add64(100).add64(200);
      const encryptedTransferAmount1 = inputAlice1.encrypt();
      const tx = await token
        .connect(signers.aliceWallet)
        ["batchTransfer(address[],bytes32[],bytes)"](
          addresses,
          [encryptedTransferAmount1.handles[0], encryptedTransferAmount1.handles[1]],
          encryptedTransferAmount1.inputProof
        );
      await tx.wait();
      const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
      const balanceAfter = await decrypt64(balanceHandleAfter);
      await ethers.provider.send("evm_revert", [snapshotId]);
      expect(balanceAfter).to.equal(balance - BigInt(300));
    });
  });

  describe(".transferFrom()", () => {
    describe("when the token is paused", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        await token.connect(signers.tokenAgent).pause();
        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(100);
        const encryptedTransferAmount = inputAlice.encrypt();
        try {
          const tx = await token
            .connect(signers.bobWallet)
            ["transferFrom(address,address,bytes32,bytes)"](
              signers.aliceWallet.address,
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("Pausable: paused");
        } finally {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
      });
    });

    describe("when sender address is frozen", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        await token.connect(signers.tokenAgent).setAddressFrozen(signers.aliceWallet.address, true);

        try {
          const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
          inputBob.add64(100);
          const encryptedTransferAmount = inputBob.encrypt();
          const tx = await token
            .connect(signers.bobWallet)
            ["transferFrom(address,address,bytes32,bytes)"](
              signers.aliceWallet.address,
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("wallet is frozen");
        } finally {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
      });
    });

    describe("when recipient address is frozen", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        await token.connect(signers.tokenAgent).setAddressFrozen(signers.bobWallet.address, true);

        try {
          const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
          inputBob.add64(100);
          const encryptedTransferAmount = inputBob.encrypt();
          const tx = await token
            .connect(signers.bobWallet)
            ["transferFrom(address,address,bytes32,bytes)"](
              signers.aliceWallet.address,
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("wallet is frozen");
        } finally {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
      });
    });

    describe("when sender has not enough balance", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(balance + BigInt(100));
        const encryptedAllowanceAmount = inputAlice.encrypt();
        const tx1 = await token
          .connect(signers.aliceWallet)
          ["approve(address,bytes32,bytes)"](
            signers.bobWallet.address,
            encryptedAllowanceAmount.handles[0],
            encryptedAllowanceAmount.inputProof
          );
        await tx1.wait();

        const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
        inputBob.add64(balance + BigInt(100));
        const encryptedTransferAmount = inputBob.encrypt();
        const tx = await token
          .connect(signers.bobWallet)
          ["transferFrom(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance);
      });
    });

    describe("when sender has not enough balance unfrozen", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputAlice = instances.aliceWallet.createEncryptedInput(await token.getAddress(), signers.aliceWallet.address);
        inputAlice.add64(BigInt(100));
        const encryptedAllowanceAmount = inputAlice.encrypt();
        const tx1 = await token
          .connect(signers.aliceWallet)
          ["approve(address,bytes32,bytes)"](
            signers.bobWallet.address,
            encryptedAllowanceAmount.handles[0],
            encryptedAllowanceAmount.inputProof
          );
        await tx1.wait();
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const inputAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputAgent.add64(BigInt(100));
        const encryptedFreezeAmount = inputAgent.encrypt();
        const t1 = await token
          .connect(signers.tokenAgent)
          ["freezePartialTokens(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedFreezeAmount.handles[0],
            encryptedFreezeAmount.inputProof
          );
        await t1.wait();
        const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
        inputBob.add64(balance);
        const encryptedTransferAmount = inputBob.encrypt();
        const tx = await token
          .connect(signers.bobWallet)
          ["transferFrom(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance);
      });
    });
    describe("when the recipient identity is not verified", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        try {
          const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
          inputBob.add64(100);
          const encryptedTransferAmount = inputBob.encrypt();
          const tx = await token
            .connect(signers.bobWallet)
            ["transferFrom(address,address,bytes32,bytes)"](
              signers.aliceWallet.address,
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("Transfer not possible");
        }
      });
    });

    describe("when the transfer breaks compliance rules", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
        inputBob.add64(100);
        const encryptedTransferAmount = inputBob.encrypt();
        const tx = await token
          .connect(signers.bobWallet)
          ["transferFrom(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        expect(balanceAfter).to.equal(balance);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when the transfer is compliant", () => {
      it("should transfer tokens and reduce allowance of transferred value", async () => {
        const {
          suite: { token, compliance },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);
        await compliance.callModuleFunction(
          new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData("addAllowedCountry", [666]),
          await moduleCountry.getAddress()
        );

        const inputBob = instances.bobWallet.createEncryptedInput(await token.getAddress(), signers.bobWallet.address);
        inputBob.add64(100);
        const encryptedTransferAmount = inputBob.encrypt();
        const tx = await token
          .connect(signers.bobWallet)
          ["transferFrom(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance - BigInt(100));
      });
    });
  });

  describe(".forcedTransfer()", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        try {
          await token.connect(signers.aliceWallet).forcedTransfer(signers.aliceWallet.address, signers.bobWallet.address, 100);
        } catch (error) {
          expect(error.message).to.include("AgentRole: caller does not have the Agent role");
        }
      });
    });
    describe("when source wallet has not enough balance", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputTokenAgent.add64(balance + BigInt(100));
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        const tx = await token
          .connect(signers.tokenAgent)
          ["forcedTransfer(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        expect(balanceAfter).to.equal(balance);
      });
    });
    describe("when recipient identity is not verified", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        try {
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
          inputTokenAgent.add64(BigInt(100));
          const encryptedTransferAmount = inputTokenAgent.encrypt();
          const tx = await token
            .connect(signers.tokenAgent)
            ["forcedTransfer(address,address,bytes32,bytes)"](
              signers.aliceWallet.address,
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
        } catch (error) {
          expect(error.message).to.include("Transfer not possible");
        }
      });
    });
    describe("when the transfer breaks compliance rules", () => {
      it("should still transfer tokens", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputTokenAgent.add64(BigInt(100));
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        const tx = await token
          .connect(signers.tokenAgent)
          ["forcedTransfer(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(balanceAfter).to.equal(balance - BigInt(100));
      });
    });
    describe("when amount is greater than unfrozen balance", () => {
      it("should unfroze tokens", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const inputAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputAgent.add64(balance - BigInt(100)).add64(balance - BigInt(50));
        const encryptedAmount = inputAgent.encrypt();
        const t1 = await token
          .connect(signers.tokenAgent)
          ["freezePartialTokens(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedAmount.handles[0],
            encryptedAmount.inputProof
          );
        await t1.wait();
        const tx = await token
          .connect(signers.tokenAgent)
          ["forcedTransfer(address,address,bytes32,bytes)"](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedAmount.handles[1],
            encryptedAmount.inputProof
          );
        await tx.wait();
        const balanceFrozen = await token.getFrozenTokens(signers.aliceWallet.address);
        const frozen = await decrypt64(balanceFrozen);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(frozen).to.be.equal(50);
      });
    });
  });
  describe(".burn()", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.aliceWallet).burn(signers.aliceWallet.address, 100)).to.be.revertedWith(
          "AgentRole: caller does not have the Agent role"
        );
      });
    });
    describe("when source wallet has not enough balance", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputTokenAgent.add64(balance + BigInt(100));
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        const tx = await token
          .connect(signers.tokenAgent)
          ["burn(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandleAfter = await token.balanceOf(signers.aliceWallet);
        const balanceAfter = await decrypt64(balanceHandleAfter);
        expect(balanceAfter).to.equal(balance);
      });
    });
    describe("when amount to burn is greater that unfrozen balance", () => {
      it("should burn and decrease frozen balance", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const balanceHandle = await token.balanceOf(signers.aliceWallet.address);
        const balance = await decrypt64(balanceHandle);
        const inputAgent = instances.tokenAgent.createEncryptedInput(await token.getAddress(), signers.tokenAgent.address);
        inputAgent.add64(balance - BigInt(100)).add64(balance - BigInt(50));
        const encryptedAmount = inputAgent.encrypt();
        const t1 = await token
          .connect(signers.tokenAgent)
          ["freezePartialTokens(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedAmount.handles[0],
            encryptedAmount.inputProof
          );
        await t1.wait();
        const tx = await token
          .connect(signers.tokenAgent)
          ["burn(address,bytes32,bytes)"](signers.aliceWallet.address, encryptedAmount.handles[1], encryptedAmount.inputProof);
        await tx.wait();

        const balanceFrozen = await token.getFrozenTokens(signers.aliceWallet.address);
        const frozen = await decrypt64(balanceFrozen);
        await ethers.provider.send("evm_revert", [snapshotId]);
        expect(frozen).to.be.equal(50);
      });
    });
  });
});
