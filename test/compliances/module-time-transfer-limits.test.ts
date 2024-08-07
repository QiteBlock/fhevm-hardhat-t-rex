import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: TimeTransferLimits", () => {
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

    const module = await ethers.deployContract("TimeTransfersLimitsModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const complianceModule = await ethers.getContractAt("TimeTransfersLimitsModule", await proxy.getAddress());
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
  it("should deploy the TimeTransferLimits contract and bind it to the compliance", async () => {
    const context = globalContext;

    expect(await context.suite.complianceModule.getAddress()).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(await context.suite.complianceModule.getAddress())).to.be.true;
  });

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;

      expect(await context.suite.complianceModule.name()).to.be.equal("TimeTransfersLimitsModule");
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

  describe(".setTimeTransferLimit", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(context.suite.complianceModule.setTimeTransferLimit({ limitTime: 1, limitValue: 100 })).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      describe("when there is already a limit for a given time", () => {
        it("should update the limit", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;

          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(100);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [1, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );
          const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent1.add64(50);
          const encryptedMaxAmount1 = inputTokenAgent1.encrypt();
          const tx = await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [1, encryptedMaxAmount1.handles[0], encryptedMaxAmount1.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          await expect(tx)
            .to.emit(context.suite.complianceModule, "TimeTransferLimitUpdated")
            .withArgs(await context.suite.compliance.getAddress(), 1);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when there are no limits for this time", () => {
        describe("when there are already 4 limits", () => {
          it("should revert", async () => {
            const snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent.add64(100);
            const encryptedMaxAmount = inputTokenAgent.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
                "setTimeTransferLimit",
                [1, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );
            const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent1.add64(1000);
            const encryptedMaxAmount1 = inputTokenAgent1.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
                "setTimeTransferLimit",
                [7, encryptedMaxAmount1.handles[0], encryptedMaxAmount1.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );
            const inputTokenAgent2 = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent2.add64(10000);
            const encryptedMaxAmount2 = inputTokenAgent2.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
                "setTimeTransferLimit",
                [30, encryptedMaxAmount2.handles[0], encryptedMaxAmount2.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );
            const inputTokenAgent3 = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent3.add64(100000);
            const encryptedMaxAmount3 = inputTokenAgent3.encrypt();
            await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
                "setTimeTransferLimit",
                [365, encryptedMaxAmount3.handles[0], encryptedMaxAmount3.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );
            const inputTokenAgent4 = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent4.add64(1000000);
            const encryptedMaxAmount4 = inputTokenAgent4.encrypt();
            await expect(
              context.suite.compliance.callModuleFunction(
                new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
                  "setTimeTransferLimit",
                  [3650, encryptedMaxAmount4.handles[0], encryptedMaxAmount4.inputProof]
                ),
                await context.suite.complianceModule.getAddress()
              )
            ).to.be.revertedWithCustomError(context.suite.complianceModule, `LimitsArraySizeExceeded`);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });

        describe("when there is not already a limit for the given time", () => {
          it("should add a new limit", async () => {
            const snapshotId = await ethers.provider.send("evm_snapshot");
            const context = globalContext;

            const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
              await context.suite.token.getAddress(),
              context.accounts.signers.tokenAgent.address
            );
            inputTokenAgent.add64(100);
            const encryptedMaxAmount = inputTokenAgent.encrypt();
            const tx = await context.suite.compliance.callModuleFunction(
              new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
                "setTimeTransferLimit",
                [1, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
              ),
              await context.suite.complianceModule.getAddress()
            );

            await expect(tx)
              .to.emit(context.suite.complianceModule, "TimeTransferLimitUpdated")
              .withArgs(await context.suite.compliance.getAddress(), 1);
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });

  describe(".getTimeTransferLimits", () => {
    describe("when there is no time transfer limit", () => {
      it("should return empty array", async () => {
        const context = globalContext;

        const limits = await context.suite.complianceModule.getTimeTransferLimits(await context.suite.compliance.getAddress());
        expect(limits.length).to.be.eq(0);
      });
    });

    describe("when there are time transfer limit", () => {
      it("should return transfer limits", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(120);
        const encryptedMaxAmount = inputTokenAgent.encrypt();
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
            "setTimeTransferLimit",
            [10, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
          ),
          await context.suite.complianceModule.getAddress()
        );
        const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent1.add64(100);
        const encryptedMaxAmount1 = inputTokenAgent1.encrypt();
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
            "setTimeTransferLimit",
            [15, encryptedMaxAmount1.handles[0], encryptedMaxAmount1.inputProof]
          ),
          await context.suite.complianceModule.getAddress()
        );

        const limits = await context.suite.complianceModule.getTimeTransferLimits(await context.suite.compliance.getAddress());
        expect(limits.length).to.be.eq(2);
        expect(limits[0].limitTime).to.be.eq(10);
        const limitValue = await decrypt64(limits[0].limitValue);
        expect(limitValue).to.be.eq(120);
        expect(limits[1].limitTime).to.be.eq(15);
        const limitValue1 = await decrypt64(limits[1].limitValue);
        expect(limitValue1).to.be.eq(100);
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
      describe("when counters are not initialized yet", () => {
        it("should create and increase the counters", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const from = context.accounts.signers.aliceWallet.address;
          const to = context.accounts.signers.bobWallet.address;
          const senderIdentity = await context.suite.identityRegistry.identity(from);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(120);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [10, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );
          const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent1.add64(100);
          const encryptedMaxAmount1 = inputTokenAgent1.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [15, encryptedMaxAmount1.handles[0], encryptedMaxAmount1.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

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

          const blockTimestamp = await time.latest();
          const counter1 = await context.suite.complianceModule.usersCounters(
            await context.suite.compliance.getAddress(),
            senderIdentity,
            10
          );
          expect(await decrypt64(counter1.value)).to.be.eq(80);
          expect(counter1.timer).to.be.eq(blockTimestamp + 10);

          const counter2 = await context.suite.complianceModule.usersCounters(
            await context.suite.compliance.getAddress(),
            senderIdentity,
            15
          );
          expect(await decrypt64(counter2.value)).to.be.eq(80);
          expect(counter2.timer).to.be.eq(blockTimestamp + 15);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when counters are already initialized", () => {
        it("should increase the counters", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const from = context.accounts.signers.aliceWallet.address;
          const to = context.accounts.signers.bobWallet.address;
          const senderIdentity = await context.suite.identityRegistry.identity(from);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(120);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [100, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent1.add64(100);
          const encryptedMaxAmount1 = inputTokenAgent1.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [150, encryptedMaxAmount1.handles[0], encryptedMaxAmount1.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(20);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx.wait();

          const blockTimestamp = await time.latest();
          await time.increase(10);

          const inputAlice1 = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice1.add64(30);
          const encryptedTransferAmount1 = inputAlice1.encrypt();
          const tx1 = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount1.handles[0], encryptedTransferAmount1.inputProof);
          await tx1.wait();

          const counter1 = await context.suite.complianceModule.usersCounters(
            await context.suite.compliance.getAddress(),
            senderIdentity,
            100
          );
          expect(await decrypt64(counter1.value)).to.be.eq(50);
          expect(counter1.timer).to.be.eq(blockTimestamp + 100);

          const counter2 = await context.suite.complianceModule.usersCounters(
            await context.suite.compliance.getAddress(),
            senderIdentity,
            150
          );
          expect(await decrypt64(counter2.value)).to.be.eq(50);
          expect(counter2.timer).to.be.eq(blockTimestamp + 150);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when counter is finished", () => {
        it("should reset the finished counter and increase the counters", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const from = context.accounts.signers.aliceWallet.address;
          const to = context.accounts.signers.bobWallet.address;
          const senderIdentity = await context.suite.identityRegistry.identity(from);
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(120);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [10, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent1.add64(100);
          const encryptedMaxAmount1 = inputTokenAgent1.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [150, encryptedMaxAmount1.handles[0], encryptedMaxAmount1.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(20);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);
          await tx.wait();
          const blockTimestamp = await time.latest();
          await time.increase(30);

          const inputAlice1 = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice1.add64(30);
          const encryptedTransferAmount1 = inputAlice1.encrypt();
          const tx1 = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](to, encryptedTransferAmount1.handles[0], encryptedTransferAmount1.inputProof);
          await tx1.wait();
          const resetTimestamp = await time.latest();

          const counter1 = await context.suite.complianceModule.usersCounters(
            await context.suite.compliance.getAddress(),
            senderIdentity,
            10
          );
          expect(await decrypt64(counter1.value)).to.be.eq(30);
          expect(counter1.timer).to.be.eq(resetTimestamp + 10);

          const counter2 = await context.suite.complianceModule.usersCounters(
            await context.suite.compliance.getAddress(),
            senderIdentity,
            150
          );
          expect(await decrypt64(counter2.value)).to.be.eq(50);
          expect(counter2.timer).to.be.eq(blockTimestamp + 150);
          await ethers.provider.send("evm_revert", [snapshotId]);
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
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent1.add64(100);
        const encryptedMintAmount = inputTokenAgent1.encrypt();
        const tx = await context.suite.token
          .connect(context.accounts.signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](
            context.accounts.signers.bobWallet.address,
            encryptedMintAmount.handles[0],
            encryptedMintAmount.inputProof
          );
        await tx.wait();
        const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.bobWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(600);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when value exceeds the time limit", () => {
      it("should return false", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(50);
        const encryptedMaxAmount = inputTokenAgent.encrypt();
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
            "setTimeTransferLimit",
            [10, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
          ),
          await context.suite.complianceModule.getAddress()
        );

        const inputAlice = instances.aliceWallet.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.aliceWallet.address
        );
        inputAlice.add64(100);
        const encryptedTransferAmount = inputAlice.encrypt();
        const tx = await context.suite.token
          .connect(context.accounts.signers.aliceWallet)
          ["transfer(address,bytes32,bytes)"](
            context.accounts.signers.bobWallet.address,
            encryptedTransferAmount.handles[0],
            encryptedTransferAmount.inputProof
          );
        await tx.wait();
        const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.bobWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(500);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when value does not exceed the time limit", () => {
      describe("when value exceeds the counter limit", () => {
        it("should return false", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(120);
          const encryptedMaxAmount = inputTokenAgent.encrypt();

          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [10, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );

          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              context.accounts.signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();

          const inputAlice1 = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice1.add64(100);
          const encryptedTransferAmount1 = inputAlice1.encrypt();
          const tx1 = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              context.accounts.signers.bobWallet.address,
              encryptedTransferAmount1.handles[0],
              encryptedTransferAmount1.inputProof
            );
          await tx1.wait();
          const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(600);

          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when value exceeds the counter limit but counter is finished", () => {
        it("should return true", async () => {
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const context = globalContext;
          const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.tokenAgent.address
          );
          inputTokenAgent.add64(120);
          const encryptedMaxAmount = inputTokenAgent.encrypt();
          await context.suite.compliance.callModuleFunction(
            new ethers.Interface(["function setTimeTransferLimit(uint32,bytes32,bytes)"]).encodeFunctionData(
              "setTimeTransferLimit",
              [10, encryptedMaxAmount.handles[0], encryptedMaxAmount.inputProof]
            ),
            await context.suite.complianceModule.getAddress()
          );
          const inputAlice = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice.add64(100);
          const encryptedTransferAmount = inputAlice.encrypt();
          const tx = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              context.accounts.signers.bobWallet.address,
              encryptedTransferAmount.handles[0],
              encryptedTransferAmount.inputProof
            );
          await tx.wait();
          await time.increase(30);
          const inputAlice1 = instances.aliceWallet.createEncryptedInput(
            await context.suite.token.getAddress(),
            context.accounts.signers.aliceWallet.address
          );
          inputAlice1.add64(100);
          const encryptedTransferAmount1 = inputAlice1.encrypt();
          const tx1 = await context.suite.token
            .connect(context.accounts.signers.aliceWallet)
            ["transfer(address,bytes32,bytes)"](
              context.accounts.signers.bobWallet.address,
              encryptedTransferAmount1.handles[0],
              encryptedTransferAmount1.inputProof
            );
          await tx1.wait();
          const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.bobWallet);
          const balance = await decrypt64(balanceHandle);
          expect(balance).to.equal(700);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
});
