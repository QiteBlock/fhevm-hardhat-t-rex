import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: TransferRestrict", () => {
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

    const module = await ethers.deployContract("TransferRestrictModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const complianceModule = await ethers.getContractAt("TransferRestrictModule", await proxy.getAddress());
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
  it("should deploy the TransferRestrict contract and bind it to the compliance", async () => {
    const context = globalContext;

    expect(await context.suite.complianceModule.getAddress()).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(await context.suite.complianceModule.getAddress())).to.be.true;
  });

  describe(".name", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;

      expect(await context.suite.complianceModule.name()).to.be.equal("TransferRestrictModule");
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
      const complianceModule = await ethers.deployContract("TransferRestrictModule");
      expect(await complianceModule.canComplianceBind(await context.suite.compliance.getAddress())).to.be.true;
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

  describe(".allowUser", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(context.suite.complianceModule.allowUser(context.accounts.signers.aliceWallet.address)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      it("should allow user", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function allowUser(address _userAddress)"]).encodeFunctionData("allowUser", [
            context.accounts.signers.aliceWallet.address,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, "UserAllowed")
          .withArgs(await context.suite.compliance.getAddress(), context.accounts.signers.aliceWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".batchAllowUsers", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(
          context.suite.complianceModule.batchAllowUsers([context.accounts.signers.aliceWallet.address])
        ).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      it("should allow identities", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function batchAllowUsers(address[] _identities)"]).encodeFunctionData("batchAllowUsers", [
            [context.accounts.signers.aliceWallet.address, context.accounts.signers.bobWallet.address],
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, "UserAllowed")
          .withArgs(await context.suite.compliance.getAddress(), context.accounts.signers.aliceWallet.address)
          .to.emit(context.suite.complianceModule, "UserAllowed")
          .withArgs(await context.suite.compliance.getAddress(), context.accounts.signers.bobWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".disallowUser", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(context.suite.complianceModule.disallowUser(context.accounts.signers.aliceWallet.address)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      it("should disallow user", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function allowUser(address _userAddress)"]).encodeFunctionData("allowUser", [
            context.accounts.signers.aliceWallet.address,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function disallowUser(address _userAddress)"]).encodeFunctionData("disallowUser", [
            context.accounts.signers.aliceWallet.address,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, "UserDisallowed")
          .withArgs(await context.suite.compliance.getAddress(), context.accounts.signers.aliceWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".batchDisallowUsers", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(
          context.suite.complianceModule.batchDisallowUsers([context.accounts.signers.aliceWallet.address])
        ).to.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling via compliance", () => {
      it("should disallow user", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function batchAllowUsers(address[] _identities)"]).encodeFunctionData("batchAllowUsers", [
            [context.accounts.signers.aliceWallet.address, context.accounts.signers.bobWallet.address],
          ]),
          await context.suite.complianceModule.getAddress()
        );

        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function batchDisallowUsers(address[] _identities)"]).encodeFunctionData("batchDisallowUsers", [
            [context.accounts.signers.aliceWallet.address, context.accounts.signers.bobWallet.address],
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx)
          .to.emit(context.suite.complianceModule, "UserDisallowed")
          .withArgs(await context.suite.compliance.getAddress(), context.accounts.signers.aliceWallet.address)
          .to.emit(context.suite.complianceModule, "UserDisallowed")
          .withArgs(await context.suite.compliance.getAddress(), context.accounts.signers.bobWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".isUserAllowed", () => {
    describe("when user is allowed", () => {
      it("should return true", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function allowUser(address _userAddress)"]).encodeFunctionData("allowUser", [
            context.accounts.signers.aliceWallet.address,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        const result = await context.suite.complianceModule.isUserAllowed(
          await context.suite.compliance.getAddress(),
          context.accounts.signers.aliceWallet.address
        );
        expect(result).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when user is not allowed", () => {
      it("should return false", async () => {
        const context = globalContext;
        const result = await context.suite.complianceModule.isUserAllowed(
          await context.suite.compliance.getAddress(),
          context.accounts.signers.aliceWallet.address
        );
        expect(result).to.be.false;
      });
    });
  });

  describe(".moduleCheck", () => {
    describe("when sender and receiver are not allowed", () => {
      it("should return false", async () => {
        const context = globalContext;
        const to = context.accounts.signers.bobWallet.address;
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

        const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(1000);
      });
    });

    describe("when sender is allowed", () => {
      it("should return true", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const from = context.accounts.signers.aliceWallet.address;
        const to = context.accounts.signers.bobWallet.address;

        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function allowUser(address _userAddress)"]).encodeFunctionData("allowUser", [from]),
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
        const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(990);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when receiver is allowed", () => {
      it("should return true", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;
        const to = context.accounts.signers.bobWallet.address;

        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function allowUser(address _userAddress)"]).encodeFunctionData("allowUser", [to]),
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
        const balanceHandle = await context.suite.token.balanceOf(context.accounts.signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(990);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });
});
