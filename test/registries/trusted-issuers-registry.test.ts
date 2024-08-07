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

describe("TrustedIssuersRegistry", () => {
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

  describe(".addTrustedIssuer()", () => {
    describe("when sender is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { trustedIssuersRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(
          trustedIssuersRegistry.connect(signers.anotherWallet).addTrustedIssuer(signers.anotherWallet.address, [10])
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when sender is the owner", () => {
      describe("when issuer to add is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          await expect(trustedIssuersRegistry.connect(signers.deployer).addTrustedIssuer(ZERO_ADDRESS, [10])).to.be.revertedWith(
            "invalid argument - zero address"
          );
        });
      });

      describe("when issuer is already registered", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry, claimIssuerContract },
            accounts: { signers },
          } = globalContext;

          const claimTopics = await trustedIssuersRegistry.getTrustedIssuerClaimTopics(await claimIssuerContract.getAddress());

          await expect(
            trustedIssuersRegistry
              .connect(signers.deployer)
              .addTrustedIssuer(await claimIssuerContract.getAddress(), claimTopics.toArray())
          ).to.be.revertedWith("trusted Issuer already exists");
        });
      });

      describe("when claim topics array is empty", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).addTrustedIssuer(signers.deployer.address, [])
          ).to.be.revertedWith("trusted claim topics cannot be empty");
        });
      });

      describe("when claim topics array exceeds 15 topics", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          const claimTopics = Array.from({ length: 16 }, (_, i) => i);

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).addTrustedIssuer(signers.deployer.address, claimTopics)
          ).to.be.revertedWith("cannot have more than 15 claim topics");
        });
      });

      describe("when there are already 49 trusted issuers", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;
          const snapshotId = await ethers.provider.send("evm_snapshot");
          const claimTopics = [10];

          await Promise.all(
            Array.from({ length: 49 }).map(() => {
              const wallet = ethers.Wallet.createRandom();
              return trustedIssuersRegistry.connect(signers.deployer).addTrustedIssuer(wallet.address, claimTopics);
            })
          );

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).addTrustedIssuer(signers.deployer.address, claimTopics)
          ).to.be.revertedWith("cannot have more than 50 trusted issuers");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".removeTrustedIssuer()", () => {
    describe("when sender is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { trustedIssuersRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(
          trustedIssuersRegistry.connect(signers.anotherWallet).removeTrustedIssuer(signers.anotherWallet.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when sender is the owner", () => {
      describe("when issuer to remove is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          await expect(trustedIssuersRegistry.connect(signers.deployer).removeTrustedIssuer(ZERO_ADDRESS)).to.be.revertedWith(
            "invalid argument - zero address"
          );
        });
      });

      describe("when issuer is not registered", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).removeTrustedIssuer(signers.deployer.address)
          ).to.be.revertedWith("NOT a trusted issuer");
        });
      });

      describe("when issuer is registered", () => {
        it("should remove the issuer from trusted list", async () => {
          const {
            suite: { trustedIssuersRegistry, claimIssuerContract },
            accounts: { signers },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await trustedIssuersRegistry.addTrustedIssuer(signers.bobWallet.address, [66, 100, 10]);
          await trustedIssuersRegistry.addTrustedIssuer(signers.anotherWallet.address, [10, 42]);
          await trustedIssuersRegistry.addTrustedIssuer(signers.charlieWallet.address, [42, 66, 10]);

          expect(await trustedIssuersRegistry.isTrustedIssuer(signers.anotherWallet.address)).to.be.true;

          const tx = await trustedIssuersRegistry.connect(signers.deployer).removeTrustedIssuer(signers.anotherWallet.address);
          await expect(tx).to.emit(trustedIssuersRegistry, "TrustedIssuerRemoved").withArgs(signers.anotherWallet.address);

          expect(await trustedIssuersRegistry.isTrustedIssuer(signers.anotherWallet.address)).to.be.false;
          expect(await trustedIssuersRegistry.getTrustedIssuers()).to.deep.eq([
            await claimIssuerContract.getAddress(),
            signers.bobWallet.address,
            signers.charlieWallet.address,
          ]);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".updateIssuerClaimTopics()", () => {
    describe("when sender is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { trustedIssuersRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(
          trustedIssuersRegistry.connect(signers.anotherWallet).updateIssuerClaimTopics(signers.anotherWallet.address, [10])
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when sender is the owner", () => {
      describe("when issuer to update is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).updateIssuerClaimTopics(ZERO_ADDRESS, [10])
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when issuer is not registered", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry },
            accounts: { signers },
          } = globalContext;

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).updateIssuerClaimTopics(signers.deployer.address, [10])
          ).to.be.revertedWith("NOT a trusted issuer");
        });
      });

      describe("when claim topics array have more that 15 elements", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry, claimIssuerContract },
            accounts: { signers },
          } = globalContext;

          const claimTopics = Array.from({ length: 16 }, (_, i) => i);

          await expect(
            trustedIssuersRegistry
              .connect(signers.deployer)
              .updateIssuerClaimTopics(await claimIssuerContract.getAddress(), claimTopics)
          ).to.be.revertedWith("cannot have more than 15 claim topics");
        });
      });

      describe("when claim topics array is empty", () => {
        it("should revert", async () => {
          const {
            suite: { trustedIssuersRegistry, claimIssuerContract },
            accounts: { signers },
          } = globalContext;

          await expect(
            trustedIssuersRegistry.connect(signers.deployer).updateIssuerClaimTopics(await claimIssuerContract.getAddress(), [])
          ).to.be.revertedWith("claim topics cannot be empty");
        });
      });

      describe("when issuer is registered", () => {
        it("should update the topics of the trusted issuers", async () => {
          const {
            suite: { trustedIssuersRegistry, claimIssuerContract },
            accounts: { signers },
          } = globalContext;
          const snapshotId = await ethers.provider.send("evm_snapshot");

          const claimTopics = await trustedIssuersRegistry.getTrustedIssuerClaimTopics(await claimIssuerContract.getAddress());

          const tx = await trustedIssuersRegistry
            .connect(signers.deployer)
            .updateIssuerClaimTopics(await claimIssuerContract.getAddress(), [66, 100]);
          await expect(tx)
            .to.emit(trustedIssuersRegistry, "ClaimTopicsUpdated")
            .withArgs(await claimIssuerContract.getAddress(), [66, 100]);

          expect(await trustedIssuersRegistry.hasClaimTopic(await claimIssuerContract.getAddress(), 66)).to.be.true;
          expect(await trustedIssuersRegistry.hasClaimTopic(await claimIssuerContract.getAddress(), 100)).to.be.true;
          expect(await trustedIssuersRegistry.hasClaimTopic(await claimIssuerContract.getAddress(), claimTopics[0])).to.be.false;
          expect(await trustedIssuersRegistry.getTrustedIssuerClaimTopics(await claimIssuerContract.getAddress())).to.deep.eq([
            66, 100,
          ]);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".getTrustedIssuerClaimTopics()", () => {
    describe("when issuer is not registered", () => {
      it("should revert", async () => {
        const {
          suite: { trustedIssuersRegistry },
          accounts: { signers },
        } = globalContext;

        await expect(
          trustedIssuersRegistry.connect(signers.deployer).getTrustedIssuerClaimTopics(signers.deployer.address)
        ).to.be.revertedWith("trusted Issuer doesn't exist");
      });
    });
  });
});
