import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import { deployComplianceFixture } from "../fixtures/deploy-compliance.fixture";
import { deployFullSuiteFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("ConditionalTransferModule", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const {
      suite: { compliance },
    } = await deployComplianceFixture();

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

    const module = await ethers.deployContract("ConditionalTransferModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const conditionalTransferModule = await ethers.getContractAt("ConditionalTransferModule", await proxy.getAddress());

    await compliance.addModule(await conditionalTransferModule.getAddress());

    const mockContract = await ethers.deployContract("MockContract");

    await compliance.bindToken(await mockContract.getAddress());

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        conditionalTransferModule,
        mockContract,
      },
    };
  });

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const {
        suite: { conditionalTransferModule },
      } = globalContext;

      expect(await conditionalTransferModule.name()).to.be.equal("ConditionalTransferModule");
    });
  });

  describe(".isPlugAndPlay()", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.conditionalTransferModule.isPlugAndPlay()).to.be.true;
    });
  });

  describe(".canComplianceBind", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.conditionalTransferModule.canComplianceBind(await context.suite.compliance.getAddress())).to.be
        .true;
    });
  });

  describe(".owner", () => {
    it("should return owner", async () => {
      const context = globalContext;
      expect(await context.suite.conditionalTransferModule.owner()).to.be.eq(context.accounts.signers.deployer.address);
    });
  });

  describe(".transferOwnership", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.conditionalTransferModule
            .connect(context.accounts.signers.aliceWallet)
            .transferOwnership(context.accounts.signers.bobWallet.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when calling with owner account", () => {
      it("should transfer ownership", async () => {
        // given
        const context = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        // when
        await context.suite.conditionalTransferModule
          .connect(context.accounts.signers.deployer)
          .transferOwnership(context.accounts.signers.bobWallet.address);

        // then
        const owner = await context.suite.conditionalTransferModule.owner();
        expect(owner).to.eq(context.accounts.signers.bobWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".upgradeTo", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.conditionalTransferModule.connect(context.accounts.signers.aliceWallet).upgradeTo(ZERO_ADDRESS)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe(".batchApproveTransfers", () => {
    describe("when the sender is not the compliance", () => {
      it("should revert", async () => {
        const {
          suite: { conditionalTransferModule, compliance },
          accounts: { signers },
        } = globalContext;

        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        await expect(
          conditionalTransferModule
            .connect(signers.anotherWallet)
            ["batchApproveTransfers(address[], address[],bytes32[], bytes)"](
              [signers.anotherWallet.address],
              [signers.anotherWallet.address],
              [encryptedTransferAmount.handles[0]],
              encryptedTransferAmount.inputProof
            )
        ).to.be.revertedWith("only bound compliance can call");
      });
    });

    describe("when the sender is the compliance", () => {
      it("should approve the transfers", async () => {
        const {
          suite: { compliance, conditionalTransferModule, mockContract },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();

        const tx = await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchApproveTransfers(address[], address[],bytes32[], bytes)"]).encodeFunctionData(
              "batchApproveTransfers",
              [
                [signers.aliceWallet.address],
                [signers.bobWallet.address],
                [encryptedTransferAmount.handles[0]],
                encryptedTransferAmount.inputProof,
              ]
            ),
            await conditionalTransferModule.getAddress()
          );

        await expect(tx)
          .to.emit(conditionalTransferModule, "TransferApproved")
          .withArgs(signers.aliceWallet.address, signers.bobWallet.address, await mockContract.getAddress());
        const transferHashTx = await conditionalTransferModule[
          "calculateTransferHash(address, address, bytes32, bytes, address)"
        ](
          signers.aliceWallet.address,
          signers.bobWallet.address,
          encryptedTransferAmount.handles[0],
          encryptedTransferAmount.inputProof,
          await mockContract.getAddress()
        );
        const txReceipt = await transferHashTx.wait();
        expect(await conditionalTransferModule.isTransferApproved(await compliance.getAddress(), txReceipt.logs[0].topics[1])).to
          .be.true;

        expect(
          await conditionalTransferModule.getTransferApprovals(await compliance.getAddress(), txReceipt.logs[0].topics[1])
        ).to.be.equal(1);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".batchUnApproveTransfers()", () => {
    describe("when the sender is not the compliance", () => {
      it("should revert", async () => {
        const {
          suite: { conditionalTransferModule, compliance },
          accounts: { signers },
        } = globalContext;

        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();

        await expect(
          conditionalTransferModule
            .connect(signers.anotherWallet)
            ["batchUnApproveTransfers(address[], address[],bytes32[], bytes)"](
              [signers.anotherWallet.address],
              [signers.anotherWallet.address],
              [encryptedTransferAmount.handles[0]],
              encryptedTransferAmount.inputProof
            )
        ).to.be.revertedWith("only bound compliance can call");
      });
    });

    describe("when the sender is the compliance", () => {
      describe("when the transfer is not approved", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, conditionalTransferModule },
            accounts: { signers },
          } = globalContext;

          const inputTokenAgent = instances.deployer.createEncryptedInput(
            await compliance.getAddress(),
            signers.deployer.address
          );
          inputTokenAgent.add64(10);
          const encryptedTransferAmount = inputTokenAgent.encrypt();
          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface([
                  "function batchUnApproveTransfers(address[], address[], bytes32[], bytes)",
                ]).encodeFunctionData("batchUnApproveTransfers", [
                  [signers.aliceWallet.address],
                  [signers.bobWallet.address],
                  [encryptedTransferAmount.handles[0]],
                  encryptedTransferAmount.inputProof,
                ]),
                await conditionalTransferModule.getAddress()
              )
          ).to.be.revertedWith("not approved");
        });
      });

      it("should unapprove the transfers", async () => {
        const {
          suite: { compliance, conditionalTransferModule, mockContract },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();

        await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchApproveTransfers(address[], address[], bytes32[], bytes)"]).encodeFunctionData(
              "batchApproveTransfers",
              [
                [signers.aliceWallet.address],
                [signers.bobWallet.address],
                [encryptedTransferAmount.handles[0]],
                encryptedTransferAmount.inputProof,
              ]
            ),
            await conditionalTransferModule.getAddress()
          );

        const tx = await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchUnApproveTransfers(address[], address[], bytes32[], bytes)"]).encodeFunctionData(
              "batchUnApproveTransfers",
              [
                [signers.aliceWallet.address],
                [signers.bobWallet.address],
                [encryptedTransferAmount.handles[0]],
                encryptedTransferAmount.inputProof,
              ]
            ),
            await conditionalTransferModule.getAddress()
          );

        await expect(tx)
          .to.emit(conditionalTransferModule, "ApprovalRemoved")
          .withArgs(signers.aliceWallet.address, signers.bobWallet.address, await mockContract.getAddress());
        const transferHashTx = await conditionalTransferModule[
          "calculateTransferHash(address, address, bytes32, bytes, address)"
        ](
          signers.aliceWallet.address,
          signers.bobWallet.address,
          encryptedTransferAmount.handles[0],
          encryptedTransferAmount.inputProof,
          await mockContract.getAddress()
        );
        const txReceipt = await transferHashTx.wait();
        expect(await conditionalTransferModule.isTransferApproved(await compliance.getAddress(), txReceipt.logs[0].topics[1])).to
          .be.false;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".approveTransfer()", () => {
    describe("when the sender is not the compliance", () => {
      it("should revert", async () => {
        const {
          suite: { conditionalTransferModule, compliance },
          accounts: { signers },
        } = globalContext;
        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();

        await expect(
          conditionalTransferModule
            .connect(signers.anotherWallet)
            ["approveTransfer(address, address, bytes32, bytes)"](
              signers.anotherWallet.address,
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            )
        ).to.be.revertedWith("only bound compliance can call");
      });
    });
  });

  describe(".unApproveTransfer()", () => {
    describe("when the sender is not the compliance", () => {
      it("should revert", async () => {
        const {
          suite: { conditionalTransferModule, compliance },
          accounts: { signers },
        } = globalContext;

        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        await expect(
          conditionalTransferModule
            .connect(signers.anotherWallet)
            ["unApproveTransfer(address, address, bytes32, bytes)"](
              signers.anotherWallet.address,
              signers.anotherWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            )
        ).to.be.revertedWith("only bound compliance can call");
      });
    });
  });

  describe(".moduleTransferAction()", () => {
    describe("when calling from a random wallet", () => {
      it("should revert", async () => {
        const {
          suite: { conditionalTransferModule, compliance },
          accounts: { signers },
        } = globalContext;

        const inputTokenAgent = instances.deployer.createEncryptedInput(await compliance.getAddress(), signers.deployer.address);
        inputTokenAgent.add64(10);
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        await expect(
          conditionalTransferModule
            .connect(signers.anotherWallet)
            ["moduleTransferAction(address, address, bytes32, bytes)"](
              signers.aliceWallet.address,
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            )
        ).to.be.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling as the compliance", () => {
      describe("when the transfer is approved", () => {
        it("should remove the transfer approval", async () => {
          const {
            suite: { compliance, conditionalTransferModule, mockContract },
            accounts: { signers },
          } = globalContext;

          const inputTokenAgent = instances.deployer.createEncryptedInput(
            await compliance.getAddress(),
            signers.deployer.address
          );
          inputTokenAgent.add64(10);
          const encryptedTransferAmount = inputTokenAgent.encrypt();
          await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function batchApproveTransfers(address[], address[], bytes32[], bytes)"]).encodeFunctionData(
                "batchApproveTransfers",
                [
                  [signers.aliceWallet.address],
                  [signers.bobWallet.address],
                  [encryptedTransferAmount.handles[0]],
                  encryptedTransferAmount.inputProof,
                ]
              ),
              await conditionalTransferModule.getAddress()
            );

          const tx = await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function moduleTransferAction(address, address, bytes32, bytes)"]).encodeFunctionData(
                "moduleTransferAction",
                [
                  signers.aliceWallet.address,
                  signers.bobWallet.address,
                  encryptedTransferAmount.handles[0],
                  encryptedTransferAmount.inputProof,
                ]
              ),
              await conditionalTransferModule.getAddress()
            );

          await expect(tx)
            .to.emit(conditionalTransferModule, "ApprovalRemoved")
            .withArgs(signers.aliceWallet.address, signers.bobWallet.address, await mockContract.getAddress());
          const transferHashTx = await conditionalTransferModule[
            "calculateTransferHash(address, address, bytes32, bytes, address)"
          ](
            signers.aliceWallet.address,
            signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof,
            await mockContract.getAddress()
          );
          const txReceipt = await transferHashTx.wait();
          expect(await conditionalTransferModule.isTransferApproved(await compliance.getAddress(), txReceipt.logs[0].topics[1]))
            .to.be.false;
        });
      });
    });
  });
});
