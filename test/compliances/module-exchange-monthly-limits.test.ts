import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import { deployComplianceFixture } from "../fixtures/deploy-compliance.fixture";
import { deployFullSuiteFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64, decryptBool } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: ExchangeMonthlyLimits", () => {
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

    const module = await ethers.deployContract("ExchangeMonthlyLimitsModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const complianceModule = await ethers.getContractAt("ExchangeMonthlyLimitsModule", await proxy.getAddress());
    await context.suite.token.connect(context.accounts.signers.deployer).setCompliance(await compliance.getAddress());
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

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;

      expect(await context.suite.complianceModule.name()).to.be.eq("ExchangeMonthlyLimitsModule");
    });
  });

  describe(".isPlugAndPlay", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.complianceModule.isPlugAndPlay()).to.be.true;
    });
  });

  describe(".canComplianceBind", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.complianceModule.canComplianceBind(await context.suite.compliance.getAddress())).to.be
        .true;
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
            .transferOwnership(context.accounts.signers.bobWallet)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when calling with owner account", () => {
      it("should transfer ownership", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        // given
        const context = globalContext;

        // when
        await context.suite.complianceModule
          .connect(context.accounts.signers.deployer)
          .transferOwnership(context.accounts.signers.bobWallet);

        // then
        const owner = await context.suite.complianceModule.owner();
        expect(owner).to.eq(context.accounts.signers.bobWallet);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".upgradeTo", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.complianceModule.connect(context.accounts.signers.aliceWallet).upgradeTo(ZERO_ADDRESS)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe(".setExchangeMonthlyLimit", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;

        await expect(context.suite.complianceModule.setExchangeMonthlyLimit(exchangeID, 1)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      it("should update the limit", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;
        let snapshotId = await ethers.provider.send("evm_snapshot");

        const inputTokenAgent1 = instances.deployer.createEncryptedInput(
          await context.suite.compliance.getAddress(),
          context.accounts.signers.deployer.address
        );
        inputTokenAgent1.add64(100);
        const encryptedExchangeLimit = inputTokenAgent1.encrypt();
        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface([
            "function setExchangeMonthlyLimit(address _exchangeID, bytes32, bytes)",
          ]).encodeFunctionData("setExchangeMonthlyLimit", [
            exchangeID,
            encryptedExchangeLimit.handles[0],
            encryptedExchangeLimit.inputProof,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, "ExchangeMonthlyLimitUpdated")
          .withArgs(await context.suite.compliance.getAddress(), exchangeID);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".getExchangeMonthlyLimit", () => {
    it("should return monthly limit", async () => {
      const context = globalContext;
      const exchangeID = context.accounts.signers.anotherWallet.address;
      let snapshotId = await ethers.provider.send("evm_snapshot");

      const inputTokenAgent1 = instances.deployer.createEncryptedInput(
        await context.suite.compliance.getAddress(),
        context.accounts.signers.deployer.address
      );
      inputTokenAgent1.add64(100);
      const encryptedExchangeLimit = inputTokenAgent1.encrypt();
      await context.suite.compliance.callModuleFunction(
        new ethers.Interface([
          "function setExchangeMonthlyLimit(address _exchangeID, bytes32, bytes)",
        ]).encodeFunctionData("setExchangeMonthlyLimit", [
          exchangeID,
          encryptedExchangeLimit.handles[0],
          encryptedExchangeLimit.inputProof,
        ]),
        await context.suite.complianceModule.getAddress()
      );

      const monthlyLimitHandle = await context.suite.complianceModule.getExchangeMonthlyLimit(
        await context.suite.compliance.getAddress(),
        exchangeID
      );
      const monthlyLimit = await decrypt64(monthlyLimitHandle);
      expect(monthlyLimit).to.be.eq(100);
      await ethers.provider.send("evm_revert", [snapshotId]);
    });
  });

  describe(".addExchangeID", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;

        await expect(
          context.suite.complianceModule.connect(context.accounts.signers.aliceWallet).addExchangeID(exchangeID)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when calling via compliance", () => {
      describe("when exchangeID is not tagged", () => {
        it("should tag ONCHAINID as exchange", async () => {
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;
          let snapshotId = await ethers.provider.send("evm_snapshot");

          const tx = await context.suite.complianceModule
            .connect(context.accounts.signers.deployer)
            .addExchangeID(exchangeID);

          await expect(tx).to.emit(context.suite.complianceModule, "ExchangeIDAdded").withArgs(exchangeID);
          expect(await context.suite.complianceModule.isExchangeID(exchangeID)).to.be.true;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when exchangeID is already tagged", () => {
        it("should revert", async () => {
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;
          let snapshotId = await ethers.provider.send("evm_snapshot");

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

          await expect(
            context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID)
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `ONCHAINIDAlreadyTaggedAsExchange`);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".removeExchangeID", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;

        await expect(
          context.suite.complianceModule.connect(context.accounts.signers.aliceWallet).removeExchangeID(exchangeID)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when calling via compliance", () => {
      describe("when exchangeID is tagged", () => {
        it("should untag the exchangeID", async () => {
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;
          let snapshotId = await ethers.provider.send("evm_snapshot");

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

          const tx = context.suite.complianceModule
            .connect(context.accounts.signers.deployer)
            .removeExchangeID(exchangeID);

          await expect(tx).to.emit(context.suite.complianceModule, "ExchangeIDRemoved").withArgs(exchangeID);
          expect(await context.suite.complianceModule.isExchangeID(exchangeID)).to.be.false;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when exchangeID is not being tagged", () => {
        it("should revert", async () => {
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;

          await expect(
            context.suite.complianceModule.connect(context.accounts.signers.deployer).removeExchangeID(exchangeID)
          ).to.be.revertedWithCustomError(context.suite.complianceModule, `ONCHAINIDNotTaggedAsExchange`);
        });
      });
    });
  });

  describe(".isExchangeID", () => {
    describe("when exchangeID is not tagged", () => {
      it("should return false", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;
        expect(await context.suite.complianceModule.isExchangeID(exchangeID)).to.be.false;
      });
    });

    describe("when exchangeID is tagged", () => {
      it("should return true", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;
        let snapshotId = await ethers.provider.send("evm_snapshot");

        await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

        expect(await context.suite.complianceModule.isExchangeID(exchangeID)).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".moduleTransferAction", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const from = context.accounts.signers.aliceWallet.address;
        const to = context.accounts.signers.bobWallet;

        await expect(context.suite.complianceModule.moduleTransferAction(from, to, 10)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      describe("when receiver is an exchange", () => {
        describe("when sender is not a token agent", () => {
          describe("when the exchange monthly limit is not exceeded", () => {
            it("should increase exchange counter", async () => {
              const context = globalContext;
              const from = context.accounts.signers.aliceWallet.address;
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const to = context.accounts.signers.bobWallet.address;
              const exchangeID = await context.suite.identityRegistry.identity(to);
              const investorID = await context.suite.identityRegistry.identity(from);

              await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

              const inputTokenAgent1 = instances.deployer.createEncryptedInput(
                await context.suite.compliance.getAddress(),
                context.accounts.signers.deployer.address
              );
              inputTokenAgent1.add64(100);
              const encryptedExchangeLimit = inputTokenAgent1.encrypt();
              await context.suite.compliance.callModuleFunction(
                new ethers.Interface([
                  "function setExchangeMonthlyLimit(address _exchangeID, bytes32, bytes)",
                ]).encodeFunctionData("setExchangeMonthlyLimit", [
                  exchangeID,
                  encryptedExchangeLimit.handles[0],
                  encryptedExchangeLimit.inputProof,
                ]),
                await context.suite.complianceModule.getAddress()
              );

              const inputAlice = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                signers.aliceWallet.address
              );
              inputAlice.add64(10);
              const encryptedTransferAmount = inputAlice.encrypt();
              const tx = await context.suite.token
                .connect(signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](
                  signers.bobWallet.address,
                  encryptedTransferAmount.handles[0],
                  encryptedTransferAmount.inputProof
                );
              await tx.wait();

              const counterHandle = await context.suite.complianceModule.getMonthlyCounter(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID
              );
              const counter = await decrypt64(counterHandle);
              expect(counter).to.be.eq(10);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });

          describe("when the exchange month is finished", () => {
            it("should set monthly timer", async () => {
              const context = globalContext;
              const from = context.accounts.signers.aliceWallet.address;
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const to = context.accounts.signers.bobWallet.address;
              const exchangeID = await context.suite.identityRegistry.identity(to);
              const investorID = await context.suite.identityRegistry.identity(from);

              await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

              const inputAlice = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                signers.aliceWallet.address
              );
              inputAlice.add64(10);
              const encryptedTransferAmount = inputAlice.encrypt();
              const tx = await context.suite.token
                .connect(signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](
                  signers.bobWallet.address,
                  encryptedTransferAmount.handles[0],
                  encryptedTransferAmount.inputProof
                );
              await tx.wait();

              const timer = await context.suite.complianceModule.getMonthlyTimer(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID
              );
              expect(timer).to.be.gt(0);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
          describe("when the exchange month is not finished", () => {
            it("should not update monthly timer", async () => {
              const context = globalContext;
              const from = context.accounts.signers.aliceWallet.address;
              const to = context.accounts.signers.bobWallet.address;
              let snapshotId = await ethers.provider.send("evm_snapshot");
              const exchangeID = await context.suite.identityRegistry.identity(to);
              const investorID = await context.suite.identityRegistry.identity(from);

              await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

              const inputAlice = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                signers.aliceWallet.address
              );
              inputAlice.add64(10);
              const encryptedTransferAmount1 = inputAlice.encrypt();
              const tx = await context.suite.token
                .connect(signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](
                  signers.bobWallet.address,
                  encryptedTransferAmount1.handles[0],
                  encryptedTransferAmount1.inputProof
                );
              await tx.wait();

              const previousTimer = await context.suite.complianceModule.getMonthlyTimer(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID
              );
              const inputAlice1 = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                signers.aliceWallet.address
              );
              inputAlice1.add64(10);
              const encryptedTransferAmount = inputAlice1.encrypt();
              const tx1 = await context.suite.token
                .connect(signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](
                  signers.bobWallet.address,
                  encryptedTransferAmount.handles[0],
                  encryptedTransferAmount.inputProof
                );
              await tx1.wait();

              const timer = await context.suite.complianceModule.getMonthlyTimer(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID
              );
              expect(timer).to.be.eq(previousTimer);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
        });

        describe("when sender is a token agent", () => {
          it("should not set limits", async () => {
            const context = globalContext;
            const from = context.accounts.signers.tokenAgent.address;
            const to = context.accounts.signers.bobWallet.address;
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const exchangeID = await context.suite.identityRegistry.identity(to);
            const investorID = await context.suite.identityRegistry.identity(from);

            await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

            const inputTokenAgent1 = instances.deployer.createEncryptedInput(
              await context.suite.compliance.getAddress(),
              context.accounts.signers.deployer.address
            );
            inputTokenAgent1.add64(100);
            const encryptedExchangeLimit = inputTokenAgent1.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface([
                "function setExchangeMonthlyLimit(address _exchangeID, bytes32, bytes)",
              ]).encodeFunctionData("setExchangeMonthlyLimit", [
                exchangeID,
                encryptedExchangeLimit.handles[0],
                encryptedExchangeLimit.inputProof,
              ]),
              await context.suite.complianceModule.getAddress()
            );

            const inputAlice = instances.aliceWallet.createEncryptedInput(
              await context.suite.token.getAddress(),
              signers.aliceWallet.address
            );
            inputAlice.add64(10);
            const encryptedTransferAmount = inputAlice.encrypt();
            const tx = await context.suite.token
              .connect(signers.aliceWallet)
              ["transfer(address,bytes32,bytes)"](
                signers.bobWallet.address,
                encryptedTransferAmount.handles[0],
                encryptedTransferAmount.inputProof
              );
            await tx.wait();

            const counter = await context.suite.complianceModule.getMonthlyCounter(
              await context.suite.compliance.getAddress(),
              exchangeID,
              investorID
            );
            expect(counter).to.be.eq(0);

            const timer = await context.suite.complianceModule.getMonthlyTimer(
              await context.suite.compliance.getAddress(),
              exchangeID,
              investorID
            );
            expect(timer).to.be.eq(0);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });

      describe("when receiver is not an exchange", () => {
        describe("when sender is not a token agent", () => {
          it("should not set limits", async () => {
            const context = globalContext;
            const from = context.accounts.signers.aliceWallet.address;
            const to = context.accounts.signers.bobWallet.address;
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const receiverID = await context.suite.identityRegistry.identity(to);
            const investorID = await context.suite.identityRegistry.identity(from);

            const inputAlice = instances.aliceWallet.createEncryptedInput(
              await context.suite.token.getAddress(),
              signers.aliceWallet.address
            );
            inputAlice.add64(10);
            const encryptedTransferAmount = inputAlice.encrypt();
            const tx = await context.suite.token
              .connect(signers.aliceWallet)
              ["transfer(address,bytes32,bytes)"](
                signers.bobWallet.address,
                encryptedTransferAmount.handles[0],
                encryptedTransferAmount.inputProof
              );
            await tx.wait();

            const counter = await context.suite.complianceModule.getMonthlyCounter(
              await context.suite.compliance.getAddress(),
              receiverID,
              investorID
            );
            expect(counter).to.be.eq(0);

            const timer = await context.suite.complianceModule.getMonthlyTimer(
              await context.suite.compliance.getAddress(),
              receiverID,
              investorID
            );
            expect(timer).to.be.eq(0);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });

        describe("when sender is a token agent", () => {
          it("should not set limits", async () => {
            const context = globalContext;
            const from = context.accounts.signers.tokenAgent.address;
            const to = context.accounts.signers.bobWallet.address;
            let snapshotId = await ethers.provider.send("evm_snapshot");
            const receiverID = await context.suite.identityRegistry.identity(to);
            const investorID = await context.suite.identityRegistry.identity(from);

            const inputAlice = instances.aliceWallet.createEncryptedInput(
              await context.suite.token.getAddress(),
              signers.aliceWallet.address
            );
            inputAlice.add64(10);
            const encryptedTransferAmount = inputAlice.encrypt();
            const tx = await context.suite.token
              .connect(signers.aliceWallet)
              ["transfer(address,bytes32,bytes)"](
                signers.bobWallet.address,
                encryptedTransferAmount.handles[0],
                encryptedTransferAmount.inputProof
              );
            await tx.wait();

            const counter = await context.suite.complianceModule.getMonthlyCounter(
              await context.suite.compliance.getAddress(),
              receiverID,
              investorID
            );
            expect(counter).to.be.eq(0);

            const timer = await context.suite.complianceModule.getMonthlyTimer(
              await context.suite.compliance.getAddress(),
              receiverID,
              investorID
            );
            expect(timer).to.be.eq(0);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });
});
