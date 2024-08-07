import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: TransferFees", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const { compliance } = await deploySuiteWithModularCompliancesFixture(
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

    const module = await ethers.deployContract("TransferFeesModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const complianceModule = await ethers.getContractAt("TransferFeesModule", await proxy.getAddress());
    await context.suite.token.addAgent(await complianceModule.getAddress());
    await context.suite.token.connect(context.accounts.signers.deployer).setCompliance(await compliance.getAddress());
    await compliance.addModule(await complianceModule.getAddress());
    const identity = await context.suite.identityRegistry.identity(context.accounts.signers.aliceWallet.address);
    await context.suite.identityRegistry
      .connect(context.accounts.signers.tokenAgent)
      .registerIdentity(context.accounts.signers.charlieWallet.address, identity, 0);

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        complianceModule,
      },
    };
  });
  it("should deploy the TransferFees contract and bind it to the compliance", async () => {
    const context = globalContext;

    expect(await context.suite.complianceModule.getAddress()).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(await context.suite.complianceModule.getAddress())).to.be.true;
  });

  describe(".owner", () => {
    it("should return owner", async () => {
      const context = globalContext;
      expect(await context.suite.complianceModule.owner()).to.be.eq(context.accounts.signers.deployer.address);
    });
  });

  describe(".transferOwnership", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.complianceModule
            .connect(context.accounts.signers.aliceWallet)
            .transferOwnership(context.accounts.signers.bobWallet.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when calling with owner account", () => {
      it("should transfer ownership", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        // given
        const context = globalContext;

        // when
        await context.suite.complianceModule
          .connect(context.accounts.signers.deployer)
          .transferOwnership(context.accounts.signers.bobWallet.address);

        // then
        const owner = await context.suite.complianceModule.owner();
        expect(owner).to.eq(context.accounts.signers.bobWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".setFee", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const collector = context.accounts.signers.anotherWallet.address;

        await expect(
          context.suite.complianceModule.connect(context.accounts.signers.anotherWallet).setFee(1, collector)
        ).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      describe("when rate is greater than the max", () => {
        it("should revert", async () => {
          const context = globalContext;
          const collector = context.accounts.signers.anotherWallet.address;

          await expect(
            context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
                10001,
                collector,
              ]),
              await context.suite.complianceModule.getAddress()
            )
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `FeeRateIsOutOfRange`);
        });
      });

      describe("when collector address is not verified", () => {
        it("should revert", async () => {
          const context = globalContext;
          const collector = context.accounts.signers.anotherWallet.address;

          await expect(
            context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
                1,
                collector,
              ]),
              await context.suite.complianceModule.getAddress()
            )
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `CollectorAddressIsNotVerified`);
        });
      });

      describe("when collector address is verified", () => {
        it("should set the fee", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const collector = context.accounts.signers.aliceWallet.address;

          const tx = await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
              1,
              collector,
            ]),
            await context.suite.complianceModule.getAddress()
          );

          await expect(tx)
            .to.emit(context.suite.complianceModule, "FeeUpdated")
            .withArgs(await context.suite.compliance.getAddress(), 1, collector);

          const fee = await context.suite.complianceModule.getFee(await context.suite.compliance.getAddress());
          expect(fee.rate).to.be.eq(1);
          expect(fee.collector).to.be.eq(collector);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".getFee", () => {
    it("should return the fee", async () => {
      const snapshotId = await ethers.provider.send("evm_snapshot");
      const context = globalContext;
      const collector = context.accounts.signers.aliceWallet.address;
      await context.suite.compliance.callModuleFunction(
        new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [1, collector]),
        await context.suite.complianceModule.getAddress()
      );

      const fee = await context.suite.complianceModule.getFee(await context.suite.compliance.getAddress());
      expect(fee.rate).to.be.eq(1);
      expect(fee.collector).to.be.eq(collector);
      await ethers.provider.send("evm_revert", [snapshotId]);
    });
  });

  describe(".isPlugAndPlay", () => {
    it("should return false", async () => {
      const context = globalContext;
      expect(await context.suite.complianceModule.isPlugAndPlay()).to.be.false;
    });
  });

  describe(".canComplianceBind", () => {
    describe("when the module is registered as a token agent", () => {
      it("should return true", async () => {
        const context = globalContext;
        const result = await context.suite.complianceModule.canComplianceBind(await context.suite.compliance.getAddress());
        expect(result).to.be.true;
      });
    });
  });

  describe(".moduleTransferAction", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const from = context.accounts.signers.aliceWallet.address;
        const to = context.accounts.signers.bobWallet.address;

        await expect(context.suite.complianceModule.moduleTransferAction(from, to, 10)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      describe("when from and to belong to the same identity", () => {
        it("should do nothing", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const collector = context.accounts.signers.charlieWallet.address;
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
              1000,
              collector,
            ]),
            await context.suite.complianceModule.getAddress()
          );

          const from = context.accounts.signers.aliceWallet.address;
          const to = context.accounts.signers.anotherWallet.address;
          const identity = await context.suite.identityRegistry.identity(from);
          await context.suite.identityRegistry.connect(context.accounts.signers.tokenAgent).registerIdentity(to, identity, 0);

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(80);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx.wait();

          const collectedAmount = await context.suite.token.balanceOf(collector);
          expect(collectedAmount).to.be.eq(0);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when fee is zero", () => {
        it("should do nothing", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const collector = context.accounts.signers.charlieWallet.address;
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
              0,
              collector,
            ]),
            await context.suite.complianceModule.getAddress()
          );

          const to = context.accounts.signers.bobWallet.address;

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(80);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx.wait();

          const collectedAmount = await context.suite.token.balanceOf(collector);
          expect(collectedAmount).to.be.eq(0);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when sender is the collector", () => {
        it("should do nothing", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const collector = context.accounts.signers.charlieWallet.address;
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
              1000,
              collector,
            ]),
            await context.suite.complianceModule.getAddress()
          );

          const to = context.accounts.signers.bobWallet.address;

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.tokenAgent.address
          );
          inputTokenAgent.add64(1000);
          const encryptedMintAmount = inputTokenAgent.encrypt();
          const tx1 = await context.suite.token
            .connect(signers.tokenAgent)
            ["mint(address,bytes32,bytes)"](
              context.accounts.signers.charlieWallet,
              encryptedMintAmount.handles[0],
              encryptedMintAmount.inputProof
            );
          await tx1.wait();

          const inputCharlie = instances.charlieWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.charlieWallet.address
          );
          inputCharlie.add64(80);
          const encryptedTransferAmount = inputCharlie.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.charlieWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx.wait();

          const collectedAmount = await context.suite.token.balanceOf(collector);
          expect(await decrypt64(collectedAmount)).to.be.eq(920);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when receiver is the collector", () => {
        it("should do nothing", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const collector = context.accounts.signers.charlieWallet.address;
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
              1000,
              collector,
            ]),
            await context.suite.complianceModule.getAddress()
          );

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.tokenAgent.address
          );
          inputTokenAgent.add64(5000);
          const encryptedMintAmount = inputTokenAgent.encrypt();
          const tx1 = await context.suite.token
            .connect(signers.tokenAgent)
            ["mint(address,bytes32,bytes)"](
              context.accounts.signers.charlieWallet,
              encryptedMintAmount.handles[0],
              encryptedMintAmount.inputProof
            );
          await tx1.wait();

          const inputBob = instances.charlieWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.charlieWallet.address
          );
          inputBob.add64(80);
          const encryptedTransferAmount = inputBob.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.bobWallet)
            ["transfer(address,bytes32,bytes)"](
              collector,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();

          const collectedAmount = await context.suite.token.balanceOf(collector);
          expect(await decrypt64(collectedAmount)).to.be.eq(5080);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when calculated fee amount is higher than zero", () => {
        it("should transfer the fee amount", async () => {
          const context = globalContext;
          const collector = context.accounts.signers.charlieWallet.address;
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setFee(uint256 _rate, address _collector)"]).encodeFunctionData("setFee", [
              1000,
              collector,
            ]),
            await context.suite.complianceModule.getAddress()
          );

          const to = context.accounts.signers.bobWallet.address;
          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(80);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx.wait();

          const collectedAmount = await context.suite.token.balanceOf(collector);
          expect(await decrypt64(collectedAmount)).to.be.eq(8); // 10% of 80

          const toBalance = await context.suite.token.balanceOf(to);
          expect(await decrypt64(toBalance)).to.be.eq(572); // it had 500 tokens before
        });
      });
    });
  });

  describe(".name", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;
      expect(await context.suite.complianceModule.name()).to.be.equal("TransferFeesModule");
    });
  });
});
