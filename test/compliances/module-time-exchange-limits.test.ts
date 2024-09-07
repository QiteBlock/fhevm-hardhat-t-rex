import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: TimeExchangeLimits", () => {
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

    const module = await ethers.deployContract("TimeExchangeLimitsModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const complianceModule = await ethers.getContractAt("TimeExchangeLimitsModule", await proxy.getAddress());
    await compliance.addModule(await complianceModule.getAddress());
    await context.suite.token.connect(context.accounts.signers.deployer).setCompliance(await compliance.getAddress());

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        complianceModule,
      },
    };
  });

  it("should deploy the TimeExchangeLimits contract and bind it to the compliance", async () => {
    const context = globalContext;

    expect(await context.suite.complianceModule.getAddress()).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(await context.suite.complianceModule.getAddress())).to.be.true;
  });

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;

      expect(await context.suite.complianceModule.name()).to.be.equal("TimeExchangeLimitsModule");
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

  describe(".setExchangeLimit", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;

        await expect(
          context.suite.complianceModule.setExchangeLimit(exchangeID, { limitTime: 1, limitValue: 100 })
        ).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      describe("when limit time does not exist", () => {
        describe("when limit array size not exceeded", () => {
          it("should add new limit", async () => {
            const snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;
            const exchangeID = context.accounts.signers.anotherWallet.address;

            const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent.add64(100);
            const encryptedMaxAmount = inputTokenAgent.encrypt();
            const tx = await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                "setExchangeLimit",
                [exchangeID, 1, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );

            await expect(tx).to.emit(context.suite.complianceModule, "ExchangeLimitUpdated");

            const limits = await context.suite.complianceModule.getExchangeLimits(
              await context.suite.compliance.getAddress(),
              exchangeID
            );
            expect(limits.length).to.be.eq(1);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
        describe("when there are already 4 limits", () => {
          it("should revert", async () => {
            const snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;
            const exchangeID = context.accounts.signers.anotherWallet.address;
            const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent.add64(100);
            const encryptedMaxAmount = inputTokenAgent.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                "setExchangeLimit",
                [exchangeID, 1, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );

            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                "setExchangeLimit",
                [exchangeID, 2, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );

            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                "setExchangeLimit",
                [exchangeID, 3, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );

            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                "setExchangeLimit",
                [exchangeID, 4, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );
            await expect(
              context.suite.compliance.callModuleFunction(
                new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                  "setExchangeLimit",
                  [exchangeID, 5, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
                ),
                await context.suite.complianceModule.getAddress()
              )
            ).to.be.revertedWithCustomError(context.suite.complianceModule, `LimitsArraySizeExceeded`);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });

      describe("when limit time already exists", () => {
        it("should update the limit", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(90).add64(100);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [exchangeID, 1, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const tx = await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [exchangeID, 1, encryptedMaxAmount.handles[1], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          await expect(tx).to.emit(context.suite.complianceModule, "ExchangeLimitUpdated");

          const limits = await context.suite.complianceModule.getExchangeLimits(
            await context.suite.compliance.getAddress(),
            exchangeID
          );
          expect(limits.length).to.be.eq(1);
          expect(limits[0][0]).to.be.eq(1);
          const limitHandle = limits[0][1];
          const limitValue = await decrypt64(limitHandle);
          expect(limitValue).to.be.eq(100);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".getExchangeLimits", () => {
    it("should return limits", async () => {
      const snapshotId = await ethers.provider.send("evm_snapshot");
      const context = globalContext;
      const exchangeID = context.accounts.signers.anotherWallet.address;

      const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
        await context.suite.token.getAddress(),
        context.accounts.signers.tokenAgent.address
      );
      inputTokenAgent.add64(100);
      const encryptedMaxAmount = inputTokenAgent.encrypt();
      await context.suite.compliance.callModuleFunction(
        new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData("setExchangeLimit", [
          exchangeID,
          1,
          encryptedMaxAmount.handles[0],
          encryptedMaxAmount.inputProof,
        ]),
        await context.suite.complianceModule.getAddress()
      );

      const limits = await context.suite.complianceModule.getExchangeLimits(
        await context.suite.compliance.getAddress(),
        exchangeID
      );
      expect(limits.length).to.be.eq(1);
      expect(limits[0][0]).to.be.eq(1);
      const limitValue = await decrypt64(limits[0][1]);
      expect(limitValue).to.be.eq(100);
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

    describe("when calling with owner", () => {
      describe("when exchangeID is not tagged", () => {
        it("should tag ONCHAINID as exchange", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;

          const tx = await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

          await expect(tx).to.emit(context.suite.complianceModule, "ExchangeIDAdded").withArgs(exchangeID);
          expect(await context.suite.complianceModule.isExchangeID(exchangeID)).to.be.true;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when exchangeID is already tagged", () => {
        it("should revert", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;

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
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;

        await expect(
          context.suite.complianceModule.connect(context.accounts.signers.bobWallet).removeExchangeID(exchangeID)
        ).to.revertedWith("Ownable: caller is not the owner");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when calling via compliance", () => {
      describe("when exchangeID is tagged", () => {
        it("should untag the exchangeID", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const exchangeID = context.accounts.signers.anotherWallet.address;

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

          const tx = await context.suite.complianceModule.connect(context.accounts.signers.deployer).removeExchangeID(exchangeID);

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
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const exchangeID = context.accounts.signers.anotherWallet.address;

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
        const to = context.accounts.signers.bobWallet.address;

        await expect(context.suite.complianceModule.moduleTransferAction(from, to, 10)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      describe("when receiver is an exchange", () => {
        describe("when sender is not a token agent", () => {
          describe("when the exchange limit is not exceeded", () => {
            it("should increase exchange counter", async () => {
              const snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;
              const from = context.accounts.signers.aliceWallet.address;
              const to = context.accounts.signers.bobWallet.address;
              const exchangeID = await context.suite.identityRegistry.identity(to);
              const investorID = await context.suite.identityRegistry.identity(from);

              await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

              const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.tokenAgent.address
              );
              inputTokenAgent.add64(100).add64(10);
              const encryptedMaxAmount = inputTokenAgent.encrypt();
              await context.suite.compliance.callModuleFunction(
                new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                  "setExchangeLimit",
                  [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
                ),
                await context.suite.complianceModule.getAddress()
              );

              const inputAlice = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.aliceWallet.address
              );
              inputAlice.add64(10);
              const encryptedTransferAmount = inputAlice.encrypt();
              const tx = await context.suite.token
                .connect(context.accounts.signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
              await tx.wait();

              const counterHandle = await context.suite.complianceModule.getExchangeCounter(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID,
                10000
              );
              const counter = await decrypt64(counterHandle.value);
              expect(counter).to.be.eq(10);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });

          describe("when the exchange timer is finished", () => {
            it("should set timer", async () => {
              const snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;
              const from = context.accounts.signers.aliceWallet.address;
              const to = context.accounts.signers.bobWallet.address;
              const exchangeID = await context.suite.identityRegistry.identity(to);
              const investorID = await context.suite.identityRegistry.identity(from);

              await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

              const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.tokenAgent.address
              );
              inputTokenAgent.add64(100);
              const encryptedMaxAmount = inputTokenAgent.encrypt();
              await context.suite.compliance.callModuleFunction(
                new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                  "setExchangeLimit",
                  [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
                ),
                await context.suite.complianceModule.getAddress()
              );

              const inputAlice = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.aliceWallet.address
              );
              inputAlice.add64(10);
              const encryptedTransferAmount = inputAlice.encrypt();
              const tx = await context.suite.token
                .connect(context.accounts.signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
              await tx.wait();

              const counter = await context.suite.complianceModule.getExchangeCounter(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID,
                10000
              );
              expect(counter.timer).to.be.gt(0);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
          describe("when the exchange month is not finished", () => {
            it("should not update timer", async () => {
              const snapshotId = await ethers.provider.send("evm_snapshot");
              const context = globalContext;
              const from = context.accounts.signers.aliceWallet.address;
              const to = context.accounts.signers.bobWallet.address;
              const exchangeID = await context.suite.identityRegistry.identity(to);
              const investorID = await context.suite.identityRegistry.identity(from);

              await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);

              const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.tokenAgent.address
              );
              inputTokenAgent.add64(100);
              const encryptedMaxAmount = inputTokenAgent.encrypt();
              await context.suite.compliance.callModuleFunction(
                new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                  "setExchangeLimit",
                  [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
                ),
                await context.suite.complianceModule.getAddress()
              );

              const inputAlice = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.aliceWallet.address
              );
              inputAlice.add64(10);
              const encryptedTransferAmount = inputAlice.encrypt();
              const tx = await context.suite.token
                .connect(context.accounts.signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
              await tx.wait();

              const previousCounter = await context.suite.complianceModule.getExchangeCounter(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID,
                10000
              );

              const inputAlice1 = instances.aliceWallet.createEncryptedInput(
                await context.suite.token.getAddress(),
                context.accounts.signers.aliceWallet.address
              );
              inputAlice1.add64(11);
              const encryptedTransferAmount1 = inputAlice1.encrypt();
              const tx1 = await context.suite.token
                .connect(context.accounts.signers.aliceWallet)
                ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount1.handles[0], encryptedTransferAmount1.inputProof);
              await tx1.wait();

              const counter = await context.suite.complianceModule.getExchangeCounter(
                await context.suite.compliance.getAddress(),
                exchangeID,
                investorID,
                10000
              );
              expect(counter.timer).to.be.eq(previousCounter.timer);
              await ethers.provider.send("evm_revert", [snapshotId]);
            });
          });
        });
      });

      describe("when receiver is not an exchange", () => {
        describe("when sender is not a token agent", () => {
          it("should not set limits", async () => {
            const snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;
            const from = context.accounts.signers.aliceWallet.address;
            const to = context.accounts.signers.bobWallet.address;
            const receiverID = await context.suite.identityRegistry.identity(to);
            const investorID = await context.suite.identityRegistry.identity(from);

            const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent.add64(100);
            const encryptedMaxAmount = inputTokenAgent.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
                "setExchangeLimit",
                [receiverID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );

            const inputAlice = instances.aliceWallet.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.aliceWallet.address
            );
            inputAlice.add64(10);
            const encryptedTransferAmount = inputAlice.encrypt();
            const tx = await context.suite.token
              .connect(context.accounts.signers.aliceWallet)
              ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
            await tx.wait();

            const counter = await context.suite.complianceModule.getExchangeCounter(
              await context.suite.compliance.getAddress(),
              receiverID,
              investorID,
              10000
            );
            expect(counter.timer).to.be.eq(0);
            expect(counter.value).to.be.eq(0);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
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
      expect(await context.suite.complianceModule.canComplianceBind(await context.suite.compliance.getAddress())).to.be.true;
    });
  });

  describe(".moduleCheck", () => {
    describe("when from is null address", () => {
      it("should return true", async () => {
        const context = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const to = context.accounts.signers.bobWallet.address;

        const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent1.add64(100);
        const encryptedMintAmount = inputTokenAgent1.encrypt();
        const tx = await context.suite.token
          .connect(context.accounts.signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
        await tx.wait();

        const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(600);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when receiver is not exchange", () => {
      it("should return true", async () => {
        const context = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const to = context.accounts.signers.bobWallet.address;

        const inputAlice = instances.aliceWallet.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.aliceWallet.address
        );
        inputAlice.add64(100);
        const encryptedMintAmount = inputAlice.encrypt();
        const tx = await context.suite.token
          .connect(context.accounts.signers.aliceWallet)
          ["transfer(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
        await tx.wait();

        const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(600);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when receiver is exchange", () => {
      describe("when sender is exchange", () => {
        it("should return true", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const from = context.accounts.signers.aliceWallet.address;
          const to = context.accounts.signers.bobWallet.address;
          const senderExchangeID = await context.suite.identityRegistry.identity(from);
          const receiverExchangeID = await context.suite.identityRegistry.identity(to);

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(receiverExchangeID);

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(senderExchangeID);

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(90);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [receiverExchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );
          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedMintAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(600);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when value exceeds the limit", () => {
        it("should return false", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const to = context.accounts.signers.bobWallet.address;
          const exchangeID = await context.suite.identityRegistry.identity(to);

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(90);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedMintAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(500);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when exchange month is finished", () => {
        it("should return true", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const to = context.accounts.signers.bobWallet.address;
          const exchangeID = await context.suite.identityRegistry.identity(to);

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(150);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedMintAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(600);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when counter exceeds the limit", () => {
        it("should return false", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const to = context.accounts.signers.bobWallet.address;
          const exchangeID = await context.suite.identityRegistry.identity(to);

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(150);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedMintAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(600);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when counter does not exceed the limit", () => {
        it("should return true", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const to = context.accounts.signers.bobWallet.address;
          const exchangeID = await context.suite.identityRegistry.identity(to);

          await context.suite.complianceModule.connect(context.accounts.signers.deployer).addExchangeID(exchangeID);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(150);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setExchangeLimit(address,uint32,bytes32,bytes)"]).encodeFunctionData(
              "setExchangeLimit",
              [exchangeID, 10000, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedMintAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
          await tx.wait();
          const balanceHandle = await context.suite.token.balanceOf(signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(600);

          const inputAlice1 = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice1.add64(40);
          const encryptedTransferAmount = inputAlice1.encrypt();
          const tx1 = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx1.wait();
          const balanceHandle1 = await context.suite.token.balanceOf(signers.bobWallet);
          const balance1 = await decrypt64(balanceHandle1);
          expect(balance1).to.equal(640);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
});
