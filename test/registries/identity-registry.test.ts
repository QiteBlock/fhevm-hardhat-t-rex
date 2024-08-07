import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("IdentityRegistry Test", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const { compliance, complianceBeta } = await deploySuiteWithModularCompliancesFixture(
      ethers,
      await context.authorities.trexImplementationAuthority.getAddress()
    );

    const inputtokenAgent = instances.tokenAgent.createEncryptedInput(
      await context.suite.token.getAddress(),
      signers.tokenAgent.address
    );
    inputtokenAgent.add64(1000);
    const encryptedTransferAmount = inputtokenAgent.encrypt();
    const tx = await context.suite.token
      .connect(signers.tokenAgent)
      ["mint(address,bytes32,bytes)"](
        signers.aliceWallet.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      );
    await tx.wait();

    const inputtokenAgent2 = instances.tokenAgent.createEncryptedInput(
      await context.suite.token.getAddress(),
      signers.tokenAgent.address
    );
    inputtokenAgent2.add64(500);
    const encryptedTransferAmount2 = inputtokenAgent2.encrypt();
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
        compliance,
        complianceBeta,
      },
    };
  });

  describe(".init()", () => {
    it("should prevent re-initialization", async () => {
      const {
        suite: { identityRegistry },
        accounts: { signers },
      } = globalContext;

      await expect(identityRegistry.connect(signers.deployer).init(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should reject zero address for Trusted Issuers Registry", async () => {
      const identityRegistry = await ethers.deployContract("IdentityRegistry");
      await identityRegistry.waitForDeployment();
      const address = ethers.Wallet.createRandom().address;
      await expect(identityRegistry.init(ZERO_ADDRESS, address, address)).to.be.revertedWith("invalid argument - zero address");
    });

    it("should reject zero address for Claim Topics Registry", async () => {
      const identityRegistry = await ethers.deployContract("IdentityRegistry");
      await identityRegistry.waitForDeployment();
      const address = ethers.Wallet.createRandom().address;
      await expect(identityRegistry.init(address, ZERO_ADDRESS, address)).to.be.revertedWith("invalid argument - zero address");
    });

    it("should reject zero address for Identity Storage", async () => {
      const identityRegistry = await ethers.deployContract("IdentityRegistry");
      await identityRegistry.waitForDeployment();
      const address = ethers.Wallet.createRandom().address;
      await expect(identityRegistry.init(address, address, ZERO_ADDRESS)).to.be.revertedWith("invalid argument - zero address");
    });
  });

  describe(".updateIdentity()", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
          identities: { bobIdentity, charlieIdentity },
        } = globalContext;

        await expect(
          identityRegistry
            .connect(signers.anotherWallet)
            .updateIdentity(await bobIdentity.getAddress(), await charlieIdentity.getAddress())
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });
  });

  describe(".updateCountry()", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
          identities: { bobIdentity },
        } = globalContext;

        await expect(
          identityRegistry.connect(signers.anotherWallet).updateCountry(await bobIdentity.getAddress(), 100)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });
  });

  describe(".deleteIdentity()", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(
          identityRegistry.connect(signers.anotherWallet).deleteIdentity(signers.bobWallet.address)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });
  });

  describe(".registerIdentity()", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(
          identityRegistry.connect(signers.anotherWallet).registerIdentity(ZERO_ADDRESS, ZERO_ADDRESS, 0)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });
  });

  describe(".setIdentityRegistryStorage()", () => {
    describe("when sender is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(identityRegistry.connect(signers.anotherWallet).setIdentityRegistryStorage(ZERO_ADDRESS)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when sender is the owner", () => {
      it("should set the identity registry storage", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const tx = await identityRegistry.connect(signers.deployer).setIdentityRegistryStorage(ZERO_ADDRESS);
        await expect(tx).to.emit(identityRegistry, "IdentityStorageSet").withArgs(ZERO_ADDRESS);
        expect(await identityRegistry.identityStorage()).to.be.equal(ZERO_ADDRESS);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".setClaimTopicsRegistry()", () => {
    describe("when sender is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(identityRegistry.connect(signers.anotherWallet).setClaimTopicsRegistry(ZERO_ADDRESS)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when sender is the owner", () => {
      it("should set the claim topics registry", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const tx = await identityRegistry.connect(signers.deployer).setClaimTopicsRegistry(ZERO_ADDRESS);
        await expect(tx).to.emit(identityRegistry, "ClaimTopicsRegistrySet").withArgs(ZERO_ADDRESS);
        expect(await identityRegistry.topicsRegistry()).to.be.equal(ZERO_ADDRESS);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".setTrustedIssuersRegistry()", () => {
    describe("when sender is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(identityRegistry.connect(signers.anotherWallet).setTrustedIssuersRegistry(ZERO_ADDRESS)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when sender is the owner", () => {
      it("should set the trusted issuers registry", async () => {
        const {
          suite: { identityRegistry },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        const tx = await identityRegistry.connect(signers.deployer).setTrustedIssuersRegistry(ZERO_ADDRESS);
        await expect(tx).to.emit(identityRegistry, "TrustedIssuersRegistrySet").withArgs(ZERO_ADDRESS);
        expect(await identityRegistry.issuersRegistry()).to.be.equal(ZERO_ADDRESS);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".isVerified()", () => {
    describe("when there are no require claim topics", () => {
      it("should return true when the identity is registered", async () => {
        const {
          suite: { identityRegistry, claimTopicsRegistry },
          accounts: { signers },
          identities: { charlieIdentity },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        await identityRegistry.connect(signers.tokenAgent).registerIdentity(signers.charlieWallet.address, charlieIdentity, 0);
        const isVerified = await identityRegistry.isVerified(signers.charlieWallet.address);
        expect(isVerified).to.be.false;

        const topics = await claimTopicsRegistry.getClaimTopics();
        await Promise.all(topics.map((topic) => claimTopicsRegistry.removeClaimTopic(topic)));

        expect(await identityRegistry.isVerified(signers.charlieWallet.address)).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when claim topics are required but there are not trusted issuers for them", () => {
      it("should return false", async () => {
        const {
          suite: { identityRegistry, claimTopicsRegistry, trustedIssuersRegistry },
          accounts: { signers },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        expect(await identityRegistry.isVerified(signers.aliceWallet.address)).to.be.true;

        const topics = await claimTopicsRegistry.getClaimTopics();
        const trustedIssuers = await trustedIssuersRegistry.getTrustedIssuersForClaimTopic(topics[0]);
        await Promise.all(trustedIssuers.map((issuer) => trustedIssuersRegistry.removeTrustedIssuer(issuer)));

        expect(await identityRegistry.isVerified(signers.aliceWallet.address)).to.be.false;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when the only claim required was revoked", () => {
      it("should return false", async () => {
        const {
          suite: { identityRegistry, claimTopicsRegistry, claimIssuerContract },
          accounts: { signers },
          identities: { aliceIdentity },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        expect(await identityRegistry.isVerified(signers.aliceWallet.address)).to.be.true;

        const topics = await claimTopicsRegistry.getClaimTopics();
        const claimIds = await aliceIdentity.getClaimIdsByTopic(topics[0]);
        const claim = await aliceIdentity.getClaim(claimIds[0]);

        await claimIssuerContract.revokeClaimBySignature(claim.signature);

        expect(await identityRegistry.isVerified(signers.aliceWallet.address)).to.be.false;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when the claim issuer throws an error", () => {
      it("should return true if there is another valid claim", async () => {
        const {
          suite: { identityRegistry, claimTopicsRegistry, trustedIssuersRegistry, claimIssuerContract },
          accounts: { signers },
          identities: { aliceIdentity },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const trickyClaimIssuer = await ethers.deployContract("ClaimIssuerTrick");
        await trickyClaimIssuer.waitForDeployment();
        const claimTopics = await claimTopicsRegistry.getClaimTopics();
        await trustedIssuersRegistry.removeTrustedIssuer(await claimIssuerContract.getAddress());
        await trustedIssuersRegistry.addTrustedIssuer(await trickyClaimIssuer.getAddress(), claimTopics.toArray());
        await trustedIssuersRegistry.addTrustedIssuer(await claimIssuerContract.getAddress(), claimTopics.toArray());
        const claimIds = await aliceIdentity.getClaimIdsByTopic(claimTopics[0]);
        const claim = await aliceIdentity.getClaim(claimIds[0]);
        await aliceIdentity.connect(signers.aliceWallet).removeClaim(claimIds[0]);
        await aliceIdentity
          .connect(signers.aliceWallet)
          .addClaim(claimTopics[0], 1, await trickyClaimIssuer.getAddress(), "0x00", "0x00", "");
        await aliceIdentity
          .connect(signers.aliceWallet)
          .addClaim(claim.topic, claim.scheme, claim.issuer, claim.signature, claim.data, claim.uri);

        expect(await identityRegistry.isVerified(signers.aliceWallet.address)).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });

      it("should return false if there are no other valid claim", async () => {
        const {
          suite: { identityRegistry, claimTopicsRegistry, trustedIssuersRegistry },
          accounts: { signers },
          identities: { aliceIdentity },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const trickyClaimIssuer = await ethers.deployContract("ClaimIssuerTrick");
        await trickyClaimIssuer.waitForDeployment();
        const claimTopics = await claimTopicsRegistry.getClaimTopics();
        await trustedIssuersRegistry.addTrustedIssuer(await trickyClaimIssuer.getAddress(), claimTopics.toArray());
        const claimIds = await aliceIdentity.getClaimIdsByTopic(claimTopics[0]);
        await aliceIdentity.connect(signers.aliceWallet).removeClaim(claimIds[0]);
        await aliceIdentity
          .connect(signers.aliceWallet)
          .addClaim(claimTopics[0], 1, await trickyClaimIssuer.getAddress(), "0x00", "0x00", "");

        expect(await identityRegistry.isVerified(signers.aliceWallet.address)).to.be.false;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });
});
