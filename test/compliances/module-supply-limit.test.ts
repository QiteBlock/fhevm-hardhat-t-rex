import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { token } from "../../types/contracts";
import { ZERO_ADDRESS } from "../constants";
import {
  deployFullSuiteFixture,
  deploySuiteWithModularCompliancesFixture,
} from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64, decryptBool } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Compliance Module: SupplyLimit", () => {
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

    const module = await ethers.deployContract("SupplyLimitModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const complianceModule = await ethers.getContractAt("SupplyLimitModule", await proxy.getAddress());
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

  it("should deploy the SupplyLimit contract and bind it to the compliance", async () => {
    const context = globalContext;

    expect(await context.suite.complianceModule.getAddress()).not.to.be.undefined;
    expect(await context.suite.compliance.isModuleBound(await context.suite.complianceModule.getAddress())).to.be.true;
  });

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const context = globalContext;

      expect(await context.suite.complianceModule.name()).to.be.equal("SupplyLimitModule");
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
            .transferOwnership(context.accounts.signers.bobWallet.address)
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

  describe(".setSupplyLimit", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;

        await expect(context.suite.complianceModule.setSupplyLimit(100)).to.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via compliance", () => {
      it("should set supply limit", async () => {
        const context = globalContext;
        let snapshotId = await ethers.provider.send("evm_snapshot");

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(1000);
        const encryptedMaxAmount = inputTokenAgent.encrypt();
        const tx = await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setSupplyLimit(bytes32,bytes)"]).encodeFunctionData("setSupplyLimit", [
            encryptedMaxAmount.handles[0],
            encryptedMaxAmount.inputProof,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        await expect(tx).to.emit(context.suite.complianceModule, "SupplyLimitSet");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".getSupplyLimit", () => {
    describe("when calling directly", () => {
      it("should return", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(1600);
        const encryptedMaxAmount = inputTokenAgent.encrypt();
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setSupplyLimit(bytes32,bytes)"]).encodeFunctionData("setSupplyLimit", [
            encryptedMaxAmount.handles[0],
            encryptedMaxAmount.inputProof,
          ]),
          await context.suite.complianceModule.getAddress()
        );
        const supplyLimitHandle = await context.suite.complianceModule.getSupplyLimit(
          await context.suite.compliance.getAddress()
        );
        const supplyLimit = await decrypt64(supplyLimitHandle);
        expect(supplyLimit).to.be.eq(1600);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".moduleCheck", () => {
    describe("when value exceeds compliance supply limit", () => {
      it("should return false", async () => {
        const context = globalContext;
        const inputTokenAgent = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent.add64(1600);
        const encryptedMaxAmount = inputTokenAgent.encrypt();
        await context.suite.compliance.callModuleFunction(
          new ethers.Interface(["function setSupplyLimit(bytes32,bytes)"]).encodeFunctionData("setSupplyLimit", [
            encryptedMaxAmount.handles[0],
            encryptedMaxAmount.inputProof,
          ]),
          await context.suite.complianceModule.getAddress()
        );

        let snapshotId = await ethers.provider.send("evm_snapshot");
        const to = context.accounts.signers.aliceWallet.address;

        const inputTokenAgent1 = instances.tokenAgent.createEncryptedInput(
          await context.suite.token.getAddress(),
          context.accounts.signers.tokenAgent.address
        );
        inputTokenAgent1.add64(101);
        const encryptedMintAmount = inputTokenAgent1.encrypt();
        const tx = await context.suite.token
          .connect(context.accounts.signers.tokenAgent)
          ["mint(address,bytes32,bytes)"](to, encryptedMintAmount.handles[0], encryptedMintAmount.inputProof);
        await tx.wait();

        const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(1000);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when supply limit does not exceed compliance supply limit", () => {
      it("should return true", async () => {
        let snapshotId = await ethers.provider.send("evm_snapshot");
        const context = globalContext;

        const to = context.accounts.signers.aliceWallet.address;

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

        const balanceHandle = await context.suite.token.balanceOf(signers.aliceWallet);
        const balance = await decrypt64(balanceHandle);
        expect(balance).to.equal(1100);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });
});
