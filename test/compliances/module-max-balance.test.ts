import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: MaxBalance", () => {
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
    inputTokenAgent.add64(0);
    const encryptedTransferAmount = inputTokenAgent.encrypt();
    const tx = await context.suite.token
      .connect(signers.tokenAgent)
      ["mint(address,bytes32,bytes)"](
        signers.aliceWallet.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );
    await tx.wait();

    const module = await ethers.deployContract("MaxBalanceModule");
    await module.waitForDeployment();
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    await proxy.waitForDeployment();
    const complianceModule = await ethers.getContractAt("MaxBalanceModule", await proxy.getAddress());
    await context.suite.token.connect(context.accounts.signers.deployer).setCompliance(await compliance.getAddress());
    await complianceModule.connect(context.accounts.signers.deployer).presetCompleted(await compliance.getAddress());
    await compliance.addModule(await complianceModule.getAddress());

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        complianceModule,
      },
    };
  });
  it("should deploy the MaxBalance contract and bind it to the compliance", async () => {
    const context = globalContext;

    expect(await context.suite.complianceModule.getAddress()).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(await context.suite.complianceModule.getAddress())).to.be.true;
  });

  describe(".name", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;

      expect(await context.suite.complianceModule.name()).to.be.equal("MaxBalanceModule");
    });
  });

  describe(".isPlugAndPlay", () => {
    it("should return false", async () => {
      const context = globalContext;
      expect(await context.suite.complianceModule.isPlugAndPlay()).to.be.false;
    });
  });

  describe(".setMaxBalance", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(context.suite.complianceModule.setMaxBalance(100)).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      it("should set max balance", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          signers.tokenAgent.address
        );
        inputTokenAgent.add64(1000);
        const encryptedTransferAmount = inputTokenAgent.encrypt();
        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setMaxBalance(bytes32,bytes)"]).encodeFunctionData("setMaxBalance", [
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx).to.emit(context.suite.complianceModule, "MaxBalanceSet");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
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

  describe(".preSetModuleState", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.complianceModule
            .connect(context.accounts.signers.aliceWallet)
            .preSetModuleState(await context.suite.compliance.getAddress(), context.accounts.signers.aliceWallet.address, 100)
        ).to.be.revertedWithCustomError(context.suite.complianceModule, `OnlyComplianceOwnerCanCall`);
      });
    });

    describe("when calling via deployer", () => {
      describe("when compliance already bound", () => {
        it("should revert", async () => {
          const context = globalContext;
          await expect(
            context.suite.complianceModule
              .connect(context.accounts.signers.deployer)
              .preSetModuleState(await context.suite.compliance.getAddress(), context.accounts.signers.aliceWallet.address, 100)
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `TokenAlreadyBound`);
        });
      });

      describe("when compliance is not yet bound", () => {
        it("should preset", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const complianceModule = await ethers.deployContract("MaxBalanceModule");

          const inputDeployer = instances.deployer.createEncryptedInput(
            await complianceModule.getAddress(),
            context.accounts.signers.deployer.address
          );
          inputDeployer.add64(100);
          const encryptedPreSet = inputDeployer.encrypt();
          const tx = await complianceModule
            .connect(context.accounts.signers.deployer)
            ["preSetModuleState(address,address,bytes32,bytes)"](
              await context.suite.compliance.getAddress(),
              context.accounts.signers.aliceWallet.address,
              encryptedPreSet.handles[0],
              encryptedPreSet.inputProof
            );

          await expect(tx).to.emit(complianceModule, "IDBalancePreSet");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".presetCompleted", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.complianceModule
            .connect(context.accounts.signers.aliceWallet)
            .presetCompleted(await context.suite.compliance.getAddress())
        ).to.be.revertedWithCustomError(context.suite.complianceModule, `OnlyComplianceOwnerCanCall`);
      });
    });

    describe("when calling via deployer", () => {
      it("should update preset status as true", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const complianceModule = await ethers.deployContract("MaxBalanceModule");

        await complianceModule
          .connect(context.accounts.signers.deployer)
          .presetCompleted(await context.suite.compliance.getAddress());

        expect(await complianceModule.canComplianceBind(await context.suite.compliance.getAddress())).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".batchPreSetModuleState", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.complianceModule
            .connect(context.accounts.signers.aliceWallet)
            .batchPreSetModuleState(
              await context.suite.compliance.getAddress(),
              [context.accounts.signers.aliceWallet.address],
              [100]
            )
        ).to.be.revertedWithCustomError(context.suite.complianceModule, `OnlyComplianceOwnerCanCall`);
      });
    });

    describe("when calling via deployer", () => {
      describe("when _id array is empty", () => {
        it("should revert", async () => {
          const context = globalContext;
          await expect(
            context.suite.complianceModule
              .connect(context.accounts.signers.deployer)
              .batchPreSetModuleState(await context.suite.compliance.getAddress(), [], [])
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `InvalidPresetValues`);
        });
      });

      describe("when the lengths of the _id and _balance arrays are not equal", () => {
        it("should revert", async () => {
          const context = globalContext;
          await expect(
            context.suite.complianceModule
              .connect(context.accounts.signers.deployer)
              .batchPreSetModuleState(
                await context.suite.compliance.getAddress(),
                [context.accounts.signers.aliceWallet.address, context.accounts.signers.bobWallet.address],
                [100]
              )
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `InvalidPresetValues`);
        });
      });

      describe("when compliance already bound", () => {
        it("should revert", async () => {
          const context = globalContext;
          await expect(
            context.suite.complianceModule
              .connect(context.accounts.signers.deployer)
              .batchPreSetModuleState(
                await context.suite.compliance.getAddress(),
                [context.accounts.signers.aliceWallet.address],
                [100]
              )
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `TokenAlreadyBound`);
        });
      });

      describe("when compliance is not yet bound", () => {
        it("should preset", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const complianceModule = await ethers.deployContract("MaxBalanceModule");

          const inputDeployer1 = instances.deployer.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.deployer.address
          );
          inputDeployer1.add64(100);
          const encryptedTransferAmount1 = inputDeployer1.encrypt();

          const inputDeployer2 = instances.deployer.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.deployer.address
          );
          inputDeployer2.add64(200);
          const encryptedTransferAmount2 = inputDeployer2.encrypt();

          const tx = await complianceModule
            .connect(context.accounts.signers.deployer)
            ["batchPreSetModuleState(address,address[],bytes32[],bytes[])"](
              await context.suite.compliance.getAddress(),
              [context.accounts.signers.aliceWallet.address, context.accounts.signers.bobWallet.address],
              [encryptedTransferAmount1.handles[0], encryptedTransferAmount2.handles[0]],
              [encryptedTransferAmount1.inputProof, encryptedTransferAmount2.inputProof]
            );

          await expect(tx).to.emit(complianceModule, "IDBalancePreSet").to.emit(complianceModule, "IDBalancePreSet");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".moduleMintAction", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const from = context.accounts.signers.aliceWallet.address;

        await expect(context.suite.complianceModule.moduleMintAction(from, 10)).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      describe("when value exceeds the max balance", () => {
        it("should not mint token", async () => {
          const context = globalContext;

          const inputDeployer = instances.deployer.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.deployer.address
          );
          inputDeployer.add64(150);
          const encryptedMaxAmount = inputDeployer.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setMaxBalance(bytes32,bytes)"]).encodeFunctionData("setMaxBalance", [
              encryptedMaxAmount.handles[0],
              encryptedMaxAmount.inputProof,
            ]),
            await context.suite.complianceModule.getAddress()
          );
          // Important : As there are no more revert because the balance amount is encrypted. We can only do TFHE comparisons.
          // So if the comparison failed then we will transfer 0 token that's why we verified that the amount is 0 at the end.
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.tokenAgent.address
          );
          inputTokenAgent.add64(160);
          const encryptedTransferAmount = inputTokenAgent.encrypt();
          const tx = await context.suite.token
            .connect(signers.tokenAgent)
            ["mint(address,bytes32,bytes)"](
              signers.aliceWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(0);
        });
      });

      describe("when value does not exceed the max balance", () => {
        it("should update receiver and sender balances", async () => {
          const context = globalContext;

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.tokenAgent.address
          );
          inputTokenAgent.add64(100);
          const encryptedTransferAmount = inputTokenAgent.encrypt();
          const tx = await context.suite.token
            .connect(signers.tokenAgent)
            ["mint(address,bytes32,bytes)"](
              signers.aliceWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.be.eq(100);
          const idBalanceAliceHandle = await context.suite.complianceModule.getIDBalance(
            await context.suite.compliance.getAddress(),
            context.identities.aliceIdentity
          );
          const idBalanceAlice = await decrypt64(idBalanceAliceHandle);
          expect(balance).to.be.eq(idBalanceAlice);
        });
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
      describe("when value does not exceed the max balance", () => {
        it("should update receiver and sender balances", async () => {
          const context = globalContext;

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(0);
          const balanceHandleBob = await context.suite.token.balanceOf(signers.bobWallet);
          const balanceBob = await decrypt64(balanceHandleBob);
          expect(balanceBob).to.equal(100);
          const idBalanceAliceHandle = await context.suite.complianceModule.getIDBalance(
            await context.suite.compliance.getAddress(),
            context.identities.aliceIdentity
          );
          const idBalanceAlice = await decrypt64(idBalanceAliceHandle);
          expect(balance).to.be.eq(idBalanceAlice);
          const idBalanceBobHandle = await context.suite.complianceModule.getIDBalance(
            await context.suite.compliance.getAddress(),
            context.identities.bobIdentity
          );
          const idBalanceBob = await decrypt64(idBalanceBobHandle);
          expect(balanceBob).to.be.eq(idBalanceBob);
        });
      });

      describe("when value exceeds the max balance", () => {
        it("should not transfer any tokens", async () => {
          const context = globalContext;

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.tokenAgent.address
          );
          inputTokenAgent.add64(100);
          const encryptedMintAmount = inputTokenAgent.encrypt();
          const tx1 = await context.suite.token
            .connect(signers.tokenAgent)
            ["mint(address,bytes32,bytes)"](
              signers.aliceWallet.address,
              encryptedMintAmount.handles[0],
              encryptedMintAmount.inputProof
            );
          await tx1.wait();

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
          // Important : As there are no more revert because the balance amount is encrypted. We can only do TFHE comparisons.
          // So if the comparison failed then we will transfer 0 token that's why we verified that the amount is equal to the start balance.
          const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(100);
          const balanceHandleBob = await context.suite.token.balanceOf(signers.bobWallet);
          const balanceBob = await decrypt64(balanceHandleBob);
          expect(balanceBob).to.equal(100);
          const idBalanceBobHandle = await context.suite.complianceModule.getIDBalance(
            await context.suite.compliance.getAddress(),
            context.identities.bobIdentity
          );
          const idBalanceBob = await decrypt64(idBalanceBobHandle);
          expect(balanceBob).to.be.eq(idBalanceBob);
          const idBalanceAliceHandle = await context.suite.complianceModule.getIDBalance(
            await context.suite.compliance.getAddress(),
            context.identities.aliceIdentity
          );
          const idBalanceAlice = await decrypt64(idBalanceAliceHandle);
          expect(balance).to.be.eq(idBalanceAlice);
        });
      });
    });
  });

  describe(".moduleBurnAction", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const from = context.accounts.signers.bobWallet.address;

        await expect(context.suite.complianceModule.moduleBurnAction(from, 10)).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      it("should update sender balance", async () => {
        const context = globalContext;

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          signers.tokenAgent.address
        );
        inputTokenAgent.add64(50);
        const encryptedBurnAmount = inputTokenAgent.encrypt();
        const tx = await context.suite.token
          .connect(signers.tokenAgent)
          ["burn(address,bytes32,bytes)"](
            signers.aliceWallet.address,
            encryptedBurnAmount.handles[0],
            encryptedBurnAmount.inputProof
          );
        await tx.wait();
        await tx.wait();
        const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(50);
        const idBalanceAliceHandle = await context.suite.complianceModule.getIDBalance(
          await context.suite.compliance.getAddress(),
          context.identities.aliceIdentity
        );
        const idBalanceAlice = await decrypt64(idBalanceAliceHandle);
        expect(balance).to.be.eq(idBalanceAlice);
      });
    });
  });
});
