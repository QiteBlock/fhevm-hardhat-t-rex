import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";
import OnchainID from "onchain-id-custom";

import { ZERO_ADDRESS, ZERO_HASH } from "./constants";
import { deployFullSuiteFixture } from "./fixtures/deploy-full-suite.fixture";
import { createInstances } from "./instance";
import { Signers, getSigners, initSigners } from "./signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("TREXGateway", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
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

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
      },
    };
  });
  describe(".setFactory()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [ZERO_ADDRESS, false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .setFactory(await context.factories.trexFactory.getAddress())
        ).to.be.reverted;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if called with zero address", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(gateway.setFactory(ZERO_ADDRESS)).to.be.revertedWithCustomError(gateway, "ZeroAddress");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if called with valid address", () => {
        it("should set Factory", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());
          expect(await gateway.getFactory()).to.equal(ZERO_ADDRESS);

          const tx = await gateway.setFactory(await context.factories.trexFactory.getAddress());
          expect(tx).to.emit(gateway, "FactorySet");
          expect(await gateway.getFactory()).to.equal(await context.factories.trexFactory.getAddress());
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".setPublicDeploymentStatus()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [ZERO_ADDRESS, false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(gateway.connect(context.accounts.signers.anotherWallet).setPublicDeploymentStatus(true)).to.be
          .reverted;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if doesnt change status", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(gateway.setPublicDeploymentStatus(false)).to.be.revertedWithCustomError(
            gateway,
            "PublicDeploymentAlreadyDisabled"
          );
          await gateway.setPublicDeploymentStatus(true);
          await expect(gateway.setPublicDeploymentStatus(true)).to.be.revertedWithCustomError(
            gateway,
            "PublicDeploymentAlreadyEnabled"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if changes status", () => {
        it("should set new status", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          expect(await gateway.getPublicDeploymentStatus()).to.equal(false);
          const tx = await gateway.setPublicDeploymentStatus(true);
          expect(tx).to.emit(gateway, "PublicDeploymentStatusSet");
          expect(await gateway.getPublicDeploymentStatus()).to.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".transferFactoryOwnership()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .transferFactoryOwnership(context.accounts.signers.anotherWallet.address)
        ).to.be.reverted;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      it("should transfer factory ownership", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        const tx = await gateway.transferFactoryOwnership(context.accounts.signers.deployer.address);
        expect(tx).to.emit(context.factories.trexFactory, "OwnershipTransferred");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });
  describe(".enableDeploymentFee()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(gateway.connect(context.accounts.signers.anotherWallet).enableDeploymentFee(true)).to.be.reverted;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if doesnt change status", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(gateway.enableDeploymentFee(false)).to.be.revertedWithCustomError(
            gateway,
            "DeploymentFeesAlreadyDisabled"
          );
          await gateway.enableDeploymentFee(true);
          await expect(gateway.enableDeploymentFee(true)).to.be.revertedWithCustomError(
            gateway,
            "DeploymentFeesAlreadyEnabled"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if changes status", () => {
        it("should set new status", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          expect(await gateway.isDeploymentFeeEnabled()).to.equal(false);
          const tx = await gateway.enableDeploymentFee(true);
          expect(tx).to.emit(gateway, "DeploymentFeeEnabled");
          expect(await gateway.isDeploymentFeeEnabled()).to.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".setDeploymentFee()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .setDeploymentFee(
              100,
              await context.suite.token.getAddress(),
              context.accounts.signers.anotherWallet.address
            )
        ).to.be.reverted;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if required parameters are not filled", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(
            gateway.setDeploymentFee(100, ZERO_ADDRESS, context.accounts.signers.deployer.address)
          ).to.be.revertedWithCustomError(gateway, "ZeroAddress");
          await expect(
            gateway.setDeploymentFee(100, await context.suite.token.getAddress(), ZERO_ADDRESS)
          ).to.be.revertedWithCustomError(gateway, "ZeroAddress");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if called properly", () => {
        it("should set new fees structure", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          const tx = await gateway.setDeploymentFee(
            100,
            await context.suite.token.getAddress(),
            context.accounts.signers.deployer.address
          );
          expect(tx).to.emit(gateway, "DeploymentFeeSet");
          const feeStructure = await gateway.getDeploymentFee();
          expect(feeStructure.fee).to.equal(100);
          expect(feeStructure.feeToken).to.equal(await context.suite.token.getAddress());
          expect(feeStructure.feeCollector).to.equal(context.accounts.signers.deployer.address);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".addDeployer()", () => {
    describe("when called by not admin", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .addDeployer(context.accounts.signers.anotherWallet.address)
        ).to.be.revertedWithCustomError(gateway, "OnlyAdminCall");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if deployer already exists", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addDeployer(context.accounts.signers.tokenAgent.address);
          await expect(gateway.addDeployer(context.accounts.signers.tokenAgent.address)).to.be.revertedWithCustomError(
            gateway,
            "DeployerAlreadyExists"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if new deployer", () => {
        it("should add new deployer", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(false);
          const tx = await gateway.addDeployer(context.accounts.signers.tokenAgent.address);
          expect(tx).to.emit(gateway, "DeployerAdded");
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
    describe("when called by agent", () => {
      describe("if deployer already exists", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addAgent(context.accounts.signers.tokenAgent.address);
          await gateway.addDeployer(context.accounts.signers.tokenAgent.address);
          await expect(
            gateway
              .connect(context.accounts.signers.tokenAgent)
              .addDeployer(context.accounts.signers.tokenAgent.address)
          ).to.be.revertedWithCustomError(gateway, "DeployerAlreadyExists");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if new deployer", () => {
        it("should add new deployer", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(false);
          await gateway.addAgent(context.accounts.signers.tokenAgent.address);
          const tx = await gateway
            .connect(context.accounts.signers.tokenAgent)
            .addDeployer(context.accounts.signers.tokenAgent.address);
          expect(tx).to.emit(gateway, "DeployerAdded");
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".batchAddDeployer()", () => {
    describe("when called by not admin", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .batchAddDeployer([context.accounts.signers.anotherWallet.address])
        ).to.be.revertedWithCustomError(gateway, "OnlyAdminCall");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("when adding a batch of deployers that includes an already registered deployer", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addDeployer(context.accounts.signers.tokenAgent.address);
          const newDeployers = Array.from({ length: 9 }, () => ethers.Wallet.createRandom().address);
          const randomIndex = Math.floor(Math.random() * newDeployers.length);
          newDeployers.splice(randomIndex, 0, context.accounts.signers.tokenAgent.address);
          await expect(gateway.batchAddDeployer(newDeployers)).to.be.revertedWithCustomError(
            gateway,
            "DeployerAlreadyExists"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("when adding a batch of more than 500 deployers", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          const duplicateAddress = ethers.Wallet.createRandom().address;
          const newDeployers = Array.from({ length: 501 }, () => duplicateAddress);
          await expect(gateway.batchAddDeployer(newDeployers)).to.be.revertedWithCustomError(
            gateway,
            "BatchMaxLengthExceeded"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if new deployers", () => {
        it("should add 1 new deployer", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(false);
          const tx = await gateway.batchAddDeployer([context.accounts.signers.tokenAgent.address]);
          expect(tx).to.emit(gateway, "DeployerAdded");
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
        it("should add 10 new deployers", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());
          const newDeployers = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
          for (let i = 0; i < newDeployers.length; i += 1) {
            expect(await gateway.isDeployer(newDeployers[i])).to.equal(false);
          }
          const tx = await gateway.batchAddDeployer(newDeployers);
          for (let i = 0; i < newDeployers.length; i += 1) {
            await expect(tx).to.emit(gateway, "DeployerAdded").withArgs(newDeployers[i]);
          }
          for (let i = 0; i < newDeployers.length; i += 1) {
            expect(await gateway.isDeployer(newDeployers[i])).to.equal(true);
          }
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
    describe("when called by agent", () => {
      describe("when adding a batch of deployers that includes an already registered deployer", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addAgent(context.accounts.signers.anotherWallet.address);
          await gateway
            .connect(context.accounts.signers.anotherWallet)
            .addDeployer(context.accounts.signers.tokenAgent.address);
          const newDeployers = Array.from({ length: 9 }, () => ethers.Wallet.createRandom().address);
          const randomIndex = Math.floor(Math.random() * newDeployers.length);
          newDeployers.splice(randomIndex, 0, context.accounts.signers.tokenAgent.address);
          await expect(
            gateway.connect(context.accounts.signers.anotherWallet).batchAddDeployer(newDeployers)
          ).to.be.revertedWithCustomError(gateway, "DeployerAlreadyExists");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if new deployers", () => {
        it("should add 1 new deployer", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addAgent(context.accounts.signers.anotherWallet.address);
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(false);
          const tx = await gateway
            .connect(context.accounts.signers.anotherWallet)
            .batchAddDeployer([context.accounts.signers.tokenAgent.address]);
          expect(tx).to.emit(gateway, "DeployerAdded");
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(true);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
        it("should add 10 new deployers", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());
          const newDeployers = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
          for (let i = 0; i < newDeployers.length; i += 1) {
            expect(await gateway.isDeployer(newDeployers[i])).to.equal(false);
          }
          await gateway.addAgent(context.accounts.signers.anotherWallet.address);
          const tx = await gateway.connect(context.accounts.signers.anotherWallet).batchAddDeployer(newDeployers);
          for (let i = 0; i < newDeployers.length; i += 1) {
            await expect(tx).to.emit(gateway, "DeployerAdded").withArgs(newDeployers[i]);
          }
          for (let i = 0; i < newDeployers.length; i += 1) {
            expect(await gateway.isDeployer(newDeployers[i])).to.equal(true);
          }
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".removeDeployer()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .removeDeployer(context.accounts.signers.anotherWallet.address)
        ).to.be.revertedWithCustomError(gateway, "OnlyAdminCall");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if deployer does not exist", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(
            gateway.removeDeployer(context.accounts.signers.tokenAgent.address)
          ).to.be.revertedWithCustomError(gateway, "DeployerDoesNotExist");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if deployer exists", () => {
        it("should remove deployer", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addDeployer(context.accounts.signers.tokenAgent.address);
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(true);
          const tx = await gateway.removeDeployer(context.accounts.signers.tokenAgent.address);
          expect(tx).to.emit(gateway, "DeployerRemoved");
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(false);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".batchRemoveDeployer()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .batchRemoveDeployer([context.accounts.signers.anotherWallet.address])
        ).to.be.revertedWithCustomError(gateway, "OnlyAdminCall");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if deployer does not exist", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(
            gateway.batchRemoveDeployer([context.accounts.signers.tokenAgent.address])
          ).to.be.revertedWithCustomError(gateway, "DeployerDoesNotExist");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if deployer exists", () => {
        it("should remove deployer", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addDeployer(context.accounts.signers.tokenAgent.address);
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(true);
          const tx = await gateway.batchRemoveDeployer([context.accounts.signers.tokenAgent.address]);
          expect(tx).to.emit(gateway, "DeployerRemoved");
          expect(await gateway.isDeployer(context.accounts.signers.tokenAgent.address)).to.equal(false);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
        describe("when called by an agent", () => {
          describe("if at least one deployer does not exist", () => {
            it("should revert", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [ZERO_ADDRESS, false],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());

              const deployers = Array.from({ length: 9 }, () => ethers.Wallet.createRandom().address);
              await gateway.batchAddDeployer(deployers);
              deployers.push(context.accounts.signers.tokenAgent.address);
              await gateway.addAgent(context.accounts.signers.tokenAgent.address);
              await expect(
                gateway.connect(context.accounts.signers.tokenAgent).batchRemoveDeployer(deployers)
              ).to.be.revertedWithCustomError(gateway, "DeployerDoesNotExist");
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
          describe("if trying to remove more than 500 deployers", () => {
            it("should revert", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [ZERO_ADDRESS, false],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());

              const duplicateAddress = ethers.Wallet.createRandom().address;
              const deployers = Array.from({ length: 501 }, () => duplicateAddress);
              await gateway.addAgent(context.accounts.signers.tokenAgent.address);
              await expect(
                gateway.connect(context.accounts.signers.tokenAgent).batchRemoveDeployer(deployers)
              ).to.be.revertedWithCustomError(gateway, "BatchMaxLengthExceeded");
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
          describe("if all deployers exist", () => {
            it("should remove deployers", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [ZERO_ADDRESS, false],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());

              const deployers = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
              await gateway.batchAddDeployer(deployers);
              await gateway.addAgent(context.accounts.signers.tokenAgent.address);

              const tx = await gateway.connect(context.accounts.signers.tokenAgent).batchRemoveDeployer(deployers);
              for (let i = 0; i < deployers.length; i += 1) {
                await expect(tx).to.emit(gateway, "DeployerRemoved");
                expect(await gateway.isDeployer(deployers[i])).to.equal(false);
              }
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
        });
      });
    });
  });
  describe(".applyFeeDiscount()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .applyFeeDiscount(context.accounts.signers.anotherWallet.address, 5000)
        ).to.be.revertedWithCustomError(gateway, "OnlyAdminCall");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if discount out of range", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(
            gateway.applyFeeDiscount(context.accounts.signers.anotherWallet.address, 12000)
          ).to.be.revertedWithCustomError(gateway, "DiscountOutOfRange");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if discount valid", () => {
        it("should apply discount", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.setDeploymentFee(
            20000,
            await context.suite.token.getAddress(),
            context.accounts.signers.deployer.address
          );
          expect(await gateway.calculateFee(context.accounts.signers.bobWallet.address)).to.equal(20000);
          const tx = await gateway.applyFeeDiscount(context.accounts.signers.bobWallet.address, 5000);
          expect(tx).to.emit(gateway, "FeeDiscountApplied");
          expect(await gateway.calculateFee(context.accounts.signers.bobWallet.address)).to.equal(10000);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".batchApplyFeeDiscount()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const gateway = await ethers.deployContract(
          "TREXGateway",
          [await context.factories.trexFactory.getAddress(), false],
          context.accounts.signers.deployer
        );
        await context.factories.trexFactory
          .connect(context.accounts.signers.deployer)
          .transferOwnership(await gateway.getAddress());

        await expect(
          gateway
            .connect(context.accounts.signers.anotherWallet)
            .batchApplyFeeDiscount([context.accounts.signers.anotherWallet.address], [5000])
        ).to.be.revertedWithCustomError(gateway, "OnlyAdminCall");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
    describe("when called by owner", () => {
      describe("if discount out of range", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(
            gateway.batchApplyFeeDiscount([context.accounts.signers.anotherWallet.address], [12000])
          ).to.be.revertedWithCustomError(gateway, "DiscountOutOfRange");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if batch more than 500 entries", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          const duplicateAddress = ethers.Wallet.createRandom().address;
          const deployers = Array.from({ length: 501 }, () => duplicateAddress);
          const discounts = Array.from({ length: 501 }, () => 5000);

          await expect(gateway.batchApplyFeeDiscount(deployers, discounts)).to.be.revertedWithCustomError(
            gateway,
            "BatchMaxLengthExceeded"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if discount valid", () => {
        it("should apply discount", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.setDeploymentFee(
            20000,
            await context.suite.token.getAddress(),
            context.accounts.signers.deployer.address
          );
          expect(await gateway.calculateFee(context.accounts.signers.bobWallet.address)).to.equal(20000);
          const tx = await gateway.batchApplyFeeDiscount([context.accounts.signers.bobWallet.address], [5000]);
          expect(tx).to.emit(gateway, "FeeDiscountApplied");
          expect(await gateway.calculateFee(context.accounts.signers.bobWallet.address)).to.equal(10000);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
    describe("when called by agent", () => {
      describe("if any discount in the batch is out of range", () => {
        it("should revert the whole batch", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());
          const deployers = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
          const discounts = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10000));
          discounts.push(12000);

          await gateway.addAgent(context.accounts.signers.tokenAgent.address);
          await expect(
            gateway.connect(context.accounts.signers.tokenAgent).batchApplyFeeDiscount(deployers, discounts)
          ).to.be.revertedWithCustomError(gateway, "DiscountOutOfRange");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("if all discounts are valid", () => {
        it("should apply discounts to all deployers", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [ZERO_ADDRESS, false],
            context.accounts.signers.deployer
          );
          await gateway.waitForDeployment();
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          const deploymentFee = 20000;
          await gateway.setDeploymentFee(
            deploymentFee,
            await context.suite.token.getAddress(),
            context.accounts.signers.deployer.address
          );

          const deployers = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
          const discounts = Array.from({ length: 10 }, () => 5000);

          await gateway.addAgent(context.accounts.signers.tokenAgent.address);
          const tx = await gateway
            .connect(context.accounts.signers.tokenAgent)
            .batchApplyFeeDiscount(deployers, discounts);

          for (let i = 0; i < deployers.length; i += 1) {
            await expect(tx).to.emit(gateway, "FeeDiscountApplied").withArgs(deployers[i], discounts[i]);
          }

          for (let i = 0; i < deployers.length; i += 1) {
            const expectedFeeAfterDiscount = deploymentFee - (deploymentFee * discounts[0]) / 10000;
            expect(await gateway.calculateFee(deployers[i])).to.equal(expectedFeeAfterDiscount);
          }
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
  describe(".deployTREXSuite()", () => {
    describe("when called by not deployer", () => {
      describe("when public deployments disabled", () => {
        it("should revert", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [await context.factories.trexFactory.getAddress(), false],
            context.accounts.signers.deployer
          );
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await expect(
            gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
              {
                owner: context.accounts.signers.anotherWallet.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWithCustomError(gateway, "PublicDeploymentsNotAllowed");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("when public deployments are enabled", () => {
        describe("when try to deploy on behalf", () => {
          it("should revert", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), true],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());

            await expect(
              gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
                {
                  owner: context.accounts.signers.bobWallet.address,
                  name: "Token name",
                  symbol: "SYM",
                  decimals: 8,
                  irs: ZERO_ADDRESS,
                  ONCHAINID: ZERO_ADDRESS,
                  irAgents: [],
                  tokenAgents: [],
                  complianceModules: [],
                  complianceSettings: [],
                },
                {
                  claimTopics: [],
                  issuers: [],
                  issuerClaims: [],
                }
              )
            ).to.be.revertedWithCustomError(gateway, "PublicCannotDeployOnBehalf");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when deployment fees are not activated", () => {
          it("should deploy a token for free", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), true],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());

            const tx = await gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
              {
                owner: context.accounts.signers.anotherWallet.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            );
            expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
            expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when deployment fees are activated", () => {
          describe("when caller has no discount", () => {
            it("should deploy a token for full fee", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [await context.factories.trexFactory.getAddress(), true],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());
              const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
              await feeToken.mint(context.accounts.signers.anotherWallet.address, 100000);
              await gateway.setDeploymentFee(
                20000,
                await feeToken.getAddress(),
                context.accounts.signers.deployer.address
              );
              await gateway.enableDeploymentFee(true);

              await feeToken.connect(context.accounts.signers.anotherWallet).approve(await gateway.getAddress(), 20000);
              const tx = await gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
                {
                  owner: context.accounts.signers.anotherWallet.address,
                  name: "Token name",
                  symbol: "SYM",
                  decimals: 8,
                  irs: ZERO_ADDRESS,
                  ONCHAINID: ZERO_ADDRESS,
                  irAgents: [],
                  tokenAgents: [],
                  complianceModules: [],
                  complianceSettings: [],
                },
                {
                  claimTopics: [],
                  issuers: [],
                  issuerClaims: [],
                }
              );
              expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
              expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
              expect(tx).to.emit(feeToken, "Transfer");
              expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(80000);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
          describe("when caller has 50% discount", () => {
            it("should deploy a token for half fee", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [await context.factories.trexFactory.getAddress(), true],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());
              const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
              await feeToken.mint(context.accounts.signers.anotherWallet.address, 100000);
              await gateway.setDeploymentFee(
                20000,
                await feeToken.getAddress(),
                context.accounts.signers.deployer.address
              );
              await gateway.enableDeploymentFee(true);
              await gateway.applyFeeDiscount(context.accounts.signers.anotherWallet.address, 5000);

              await feeToken.connect(context.accounts.signers.anotherWallet).approve(await gateway.getAddress(), 20000);
              const tx = await gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
                {
                  owner: context.accounts.signers.anotherWallet.address,
                  name: "Token name",
                  symbol: "SYM",
                  decimals: 8,
                  irs: ZERO_ADDRESS,
                  ONCHAINID: ZERO_ADDRESS,
                  irAgents: [],
                  tokenAgents: [],
                  complianceModules: [],
                  complianceSettings: [],
                },
                {
                  claimTopics: [],
                  issuers: [],
                  issuerClaims: [],
                }
              );
              expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
              expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
              expect(tx).to.emit(feeToken, "Transfer");
              expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(90000);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
        });
      });
    });
    describe("when called by deployer", () => {
      describe("when public deployments disabled", () => {
        it("should deploy", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [await context.factories.trexFactory.getAddress(), false],
            context.accounts.signers.deployer
          );
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());
          await gateway.addDeployer(context.accounts.signers.anotherWallet.address);

          const tx = gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
            {
              owner: context.accounts.signers.anotherWallet.address,
              name: "Token name",
              symbol: "SYM",
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [],
              tokenAgents: [],
              complianceModules: [],
              complianceSettings: [],
            },
            {
              claimTopics: [],
              issuers: [],
              issuerClaims: [],
            }
          );
          expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
          expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("when try to deploy on behalf", () => {
        it("should deploy", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [await context.factories.trexFactory.getAddress(), false],
            context.accounts.signers.deployer
          );
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          await gateway.addDeployer(context.accounts.signers.anotherWallet.address);

          const tx = gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
            {
              owner: context.accounts.signers.bobWallet.address,
              name: "Token name",
              symbol: "SYM",
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [],
              tokenAgents: [],
              complianceModules: [],
              complianceSettings: [],
            },
            {
              claimTopics: [],
              issuers: [],
              issuerClaims: [],
            }
          );
          expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
          expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("when deployment fees are activated", () => {
        describe("when caller has no discount", () => {
          it("should deploy a token for full fee", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), false],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());
            await gateway.addDeployer(context.accounts.signers.anotherWallet.address);
            const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
            await feeToken.mint(context.accounts.signers.anotherWallet.address, 100000);
            await gateway.setDeploymentFee(
              20000,
              await feeToken.getAddress(),
              context.accounts.signers.deployer.address
            );
            await gateway.enableDeploymentFee(true);

            await feeToken.connect(context.accounts.signers.anotherWallet).approve(await gateway.getAddress(), 20000);
            const tx = await gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
              {
                owner: context.accounts.signers.anotherWallet.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            );
            expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
            expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            expect(tx).to.emit(feeToken, "Transfer");
            expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(80000);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when caller has 50% discount", () => {
          it("should deploy a token for half fee", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), false],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());
            await gateway.addDeployer(context.accounts.signers.anotherWallet.address);
            const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
            await feeToken.mint(context.accounts.signers.anotherWallet.address, 100000);
            await gateway.setDeploymentFee(
              20000,
              await feeToken.getAddress(),
              context.accounts.signers.deployer.address
            );
            await gateway.enableDeploymentFee(true);
            await gateway.applyFeeDiscount(context.accounts.signers.anotherWallet.address, 5000);

            await feeToken.connect(context.accounts.signers.anotherWallet).approve(await gateway.getAddress(), 20000);
            const tx = await gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
              {
                owner: context.accounts.signers.anotherWallet.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            );
            expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
            expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            expect(tx).to.emit(feeToken, "Transfer");
            expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(90000);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when caller has 100% discount", () => {
          it("should deploy a token for free", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), false],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());
            await gateway.addDeployer(context.accounts.signers.anotherWallet.address);
            const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
            await feeToken.mint(context.accounts.signers.anotherWallet.address, 100000);
            await gateway.setDeploymentFee(
              20000,
              await feeToken.getAddress(),
              context.accounts.signers.deployer.address
            );
            await gateway.enableDeploymentFee(true);
            await gateway.applyFeeDiscount(context.accounts.signers.anotherWallet.address, 10000);

            await feeToken.connect(context.accounts.signers.anotherWallet).approve(await gateway.getAddress(), 20000);
            const tx = await gateway.connect(context.accounts.signers.anotherWallet).deployTREXSuite(
              {
                owner: context.accounts.signers.anotherWallet.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            );
            expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
            expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            expect(tx).to.emit(feeToken, "Transfer");
            expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(100000);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });
  describe(".batchDeployTREXSuite()", () => {
    describe("when called by not deployer", () => {
      describe("when public deployments disabled", () => {
        it("should revert for batch deployment", async () => {
          let snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const gateway = await ethers.deployContract(
            "TREXGateway",
            [await context.factories.trexFactory.getAddress(), false],
            context.accounts.signers.deployer
          );
          await context.factories.trexFactory
            .connect(context.accounts.signers.deployer)
            .transferOwnership(await gateway.getAddress());

          const tokenDetailsArray = [];
          const claimDetailsArray = [];
          for (let i = 0; i < 5; i += 1) {
            tokenDetailsArray.push({
              owner: context.accounts.signers.anotherWallet.address,
              name: `Token name ${i}`,
              symbol: `SYM${i}`,
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [],
              tokenAgents: [],
              complianceModules: [],
              complianceSettings: [],
            });
            claimDetailsArray.push({
              claimTopics: [],
              issuers: [],
              issuerClaims: [],
            });
          }

          await expect(
            gateway
              .connect(context.accounts.signers.anotherWallet)
              .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray)
          ).to.be.revertedWithCustomError(gateway, "PublicDeploymentsNotAllowed");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
      describe("when public deployments are enabled", () => {
        describe("when try to deploy on behalf in a batch", () => {
          it("should revert the whole batch", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), true],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());

            const tokenDetailsArray = [];
            const claimDetailsArray = [];
            for (let i = 0; i < 4; i += 1) {
              tokenDetailsArray.push({
                owner: context.accounts.signers.anotherWallet.address,
                name: `Token name ${i}`,
                symbol: `SYM${i}`,
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              });
              claimDetailsArray.push({
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              });
            }
            tokenDetailsArray.push({
              owner: context.accounts.signers.bobWallet.address,
              name: "Token name behalf",
              symbol: "SYM42",
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [],
              tokenAgents: [],
              complianceModules: [],
              complianceSettings: [],
            });
            claimDetailsArray.push({
              claimTopics: [],
              issuers: [],
              issuerClaims: [],
            });

            await expect(
              gateway
                .connect(context.accounts.signers.anotherWallet)
                .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray)
            ).to.be.revertedWithCustomError(gateway, "PublicCannotDeployOnBehalf");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when try to deploy a batch of more than 5 tokens", () => {
          it("should revert the batch", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), true],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());

            const tokenDetailsArray = [];
            const claimDetailsArray = [];
            for (let i = 0; i < 6; i += 1) {
              tokenDetailsArray.push({
                owner: context.accounts.signers.anotherWallet.address,
                name: `Token name ${i}`,
                symbol: `SYM${i}`,
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              });
              claimDetailsArray.push({
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              });
            }

            await expect(
              gateway
                .connect(context.accounts.signers.anotherWallet)
                .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray)
            ).to.be.revertedWithCustomError(gateway, "BatchMaxLengthExceeded");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when deployment fees are not activated", () => {
          it("should deploy tokens for free in a batch", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), true],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());

            const tokenDetailsArray = [];
            const claimDetailsArray = [];
            for (let i = 0; i < 5; i += 1) {
              tokenDetailsArray.push({
                owner: context.accounts.signers.anotherWallet.address,
                name: `Token name ${i}`,
                symbol: `SYM${i}`,
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              });
              claimDetailsArray.push({
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              });
            }

            const tx = await gateway
              .connect(context.accounts.signers.anotherWallet)
              .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray);

            for (let i = 0; i < tokenDetailsArray.length; i += 1) {
              await expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
              await expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            }
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when deployment fees are activated", () => {
          describe("when caller has no discount", () => {
            it("should deploy tokens for full fee in a batch", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [await context.factories.trexFactory.getAddress(), true],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());
              const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
              await feeToken.mint(context.accounts.signers.anotherWallet.address, 500000);
              await gateway.setDeploymentFee(
                20000,
                await feeToken.getAddress(),
                context.accounts.signers.deployer.address
              );
              await gateway.enableDeploymentFee(true);

              await feeToken
                .connect(context.accounts.signers.anotherWallet)
                .approve(await gateway.getAddress(), 100000);

              const tokenDetailsArray = [];
              const claimDetailsArray = [];
              for (let i = 0; i < 5; i += 1) {
                tokenDetailsArray.push({
                  owner: context.accounts.signers.anotherWallet.address,
                  name: `Token name ${i}`,
                  symbol: `SYM${i}`,
                  decimals: 8,
                  irs: ZERO_ADDRESS,
                  ONCHAINID: ZERO_ADDRESS,
                  irAgents: [],
                  tokenAgents: [],
                  complianceModules: [],
                  complianceSettings: [],
                });
                claimDetailsArray.push({
                  claimTopics: [],
                  issuers: [],
                  issuerClaims: [],
                });
              }

              const tx = await gateway
                .connect(context.accounts.signers.anotherWallet)
                .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray);

              for (let i = 0; i < tokenDetailsArray.length; i += 1) {
                expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
                expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
                expect(tx)
                  .to.emit(feeToken, "Transfer")
                  .withArgs(
                    context.accounts.signers.anotherWallet.address,
                    context.accounts.signers.deployer.address,
                    20000
                  );
              }
              expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(400000);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
          describe("when caller has 50% discount", () => {
            it("should deploy tokens for half fee in a batch", async () => {
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;

              const gateway = await ethers.deployContract(
                "TREXGateway",
                [await context.factories.trexFactory.getAddress(), true],
                context.accounts.signers.deployer
              );
              await context.factories.trexFactory
                .connect(context.accounts.signers.deployer)
                .transferOwnership(await gateway.getAddress());
              const feeToken = await ethers.deployContract("TestERC20", ["FeeToken", "FT"]);
              await feeToken.mint(context.accounts.signers.anotherWallet.address, 500000);
              await gateway.setDeploymentFee(
                20000,
                await feeToken.getAddress(),
                context.accounts.signers.deployer.address
              );
              await gateway.enableDeploymentFee(true);
              await gateway.applyFeeDiscount(context.accounts.signers.anotherWallet.address, 5000);
              await feeToken.connect(context.accounts.signers.anotherWallet).approve(await gateway.getAddress(), 50000);

              const tokenDetailsArray = [];
              const claimDetailsArray = [];
              for (let i = 0; i < 5; i += 1) {
                tokenDetailsArray.push({
                  owner: context.accounts.signers.anotherWallet.address,
                  name: `Token name ${i}`,
                  symbol: `SYM${i}`,
                  decimals: 8,
                  irs: ZERO_ADDRESS,
                  ONCHAINID: ZERO_ADDRESS,
                  irAgents: [],
                  tokenAgents: [],
                  complianceModules: [],
                  complianceSettings: [],
                });
                claimDetailsArray.push({
                  claimTopics: [],
                  issuers: [],
                  issuerClaims: [],
                });
              }

              const tx = await gateway
                .connect(context.accounts.signers.anotherWallet)
                .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray);

              for (let i = 0; i < tokenDetailsArray.length; i += 1) {
                expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
                expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
                expect(tx)
                  .to.emit(feeToken, "Transfer")
                  .withArgs(
                    context.accounts.signers.anotherWallet.address,
                    context.accounts.signers.deployer.address,
                    10000
                  );
              }
              expect(await feeToken.balanceOf(context.accounts.signers.anotherWallet.address)).to.equal(450000);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
        });
      });
      describe("when called by deployer", () => {
        describe("when public deployments disabled", () => {
          it("should deploy in batch", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), false],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());
            await gateway.addDeployer(context.accounts.signers.anotherWallet.address);

            const tokenDetailsArray = [];
            const claimDetailsArray = [];
            for (let i = 0; i < 5; i += 1) {
              tokenDetailsArray.push({
                owner: context.accounts.signers.anotherWallet.address,
                name: `Token name ${i}`,
                symbol: `SYM${i}`,
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              });
              claimDetailsArray.push({
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              });
            }

            const tx = await gateway
              .connect(context.accounts.signers.anotherWallet)
              .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray);

            for (let i = 0; i < tokenDetailsArray.length; i += 1) {
              await expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
              await expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            }
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when trying to deploy on behalf", () => {
          it("should deploy in batch", async () => {
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const gateway = await ethers.deployContract(
              "TREXGateway",
              [await context.factories.trexFactory.getAddress(), false],
              context.accounts.signers.deployer
            );
            await context.factories.trexFactory
              .connect(context.accounts.signers.deployer)
              .transferOwnership(await gateway.getAddress());
            await gateway.addDeployer(context.accounts.signers.anotherWallet.address);

            const tokenDetailsArray = [];
            const claimDetailsArray = [];
            for (let i = 0; i < 5; i += 1) {
              tokenDetailsArray.push({
                owner: context.accounts.signers.bobWallet.address,
                name: `Token name ${i}`,
                symbol: `SYM${i}`,
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              });
              claimDetailsArray.push({
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              });
            }

            const tx = await gateway
              .connect(context.accounts.signers.anotherWallet)
              .batchDeployTREXSuite(tokenDetailsArray, claimDetailsArray);

            for (let i = 0; i < tokenDetailsArray.length; i += 1) {
              await expect(tx).to.emit(gateway, "GatewaySuiteDeploymentProcessed");
              await expect(tx).to.emit(context.factories.trexFactory, "TREXSuiteDeployed");
            }
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });
});
