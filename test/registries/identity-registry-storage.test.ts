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

describe("IdentityRegistryStorage", () => {
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

  describe(".init", () => {
    describe("when contract was already initialized", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
        } = globalContext;

        await expect(identityRegistryStorage.init()).to.be.revertedWith("Initializable: contract is already initialized");
      });
    });
  });

  describe(".addIdentityToStorage()", () => {
    describe("when sender is not agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
          accounts: { signers },
          identities: { charlieIdentity },
        } = globalContext;

        await expect(
          identityRegistryStorage
            .connect(signers.anotherWallet)
            .addIdentityToStorage(signers.charlieWallet.address, await charlieIdentity.getAddress(), 42)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is agent", () => {
      describe("when identity is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await identityRegistryStorage.addAgent(signers.tokenAgent.address);

          await expect(
            identityRegistryStorage
              .connect(signers.tokenAgent)
              .addIdentityToStorage(signers.charlieWallet.address, ZERO_ADDRESS, 42)
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when wallet is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
            identities: { charlieIdentity },
          } = globalContext;

          await expect(
            identityRegistryStorage
              .connect(signers.tokenAgent)
              .addIdentityToStorage(ZERO_ADDRESS, await charlieIdentity.getAddress(), 42)
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when wallet is already registered", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
            identities: { charlieIdentity },
          } = globalContext;

          await expect(
            identityRegistryStorage
              .connect(signers.tokenAgent)
              .addIdentityToStorage(signers.bobWallet.address, await charlieIdentity.getAddress(), 42)
          ).to.be.revertedWith("address stored already");
        });
      });
    });
  });

  describe(".modifyStoredIdentity()", () => {
    describe("when sender is not agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
          accounts: { signers },
          identities: { charlieIdentity },
        } = globalContext;

        await expect(
          identityRegistryStorage
            .connect(signers.anotherWallet)
            .modifyStoredIdentity(signers.charlieWallet.address, await charlieIdentity.getAddress())
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is agent", () => {
      describe("when identity is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(
            identityRegistryStorage.connect(signers.tokenAgent).modifyStoredIdentity(signers.charlieWallet.address, ZERO_ADDRESS)
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when wallet is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
            identities: { charlieIdentity },
          } = globalContext;

          await expect(
            identityRegistryStorage
              .connect(signers.tokenAgent)
              .modifyStoredIdentity(ZERO_ADDRESS, await charlieIdentity.getAddress())
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when wallet is not registered", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
            identities: { charlieIdentity },
          } = globalContext;

          await expect(
            identityRegistryStorage
              .connect(signers.tokenAgent)
              .modifyStoredIdentity(signers.charlieWallet.address, await charlieIdentity.getAddress())
          ).to.be.revertedWith("address not stored yet");
        });
      });
    });
  });

  describe(".modifyStoredInvestorCountry()", () => {
    describe("when sender is not agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
          accounts: { signers },
        } = globalContext;

        await expect(
          identityRegistryStorage.connect(signers.anotherWallet).modifyStoredInvestorCountry(signers.charlieWallet.address, 42)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is agent", () => {
      describe("when wallet is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(
            identityRegistryStorage.connect(signers.tokenAgent).modifyStoredInvestorCountry(ZERO_ADDRESS, 42)
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when wallet is not registered", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(
            identityRegistryStorage.connect(signers.tokenAgent).modifyStoredInvestorCountry(signers.charlieWallet.address, 42)
          ).to.be.revertedWith("address not stored yet");
        });
      });
    });
  });

  describe(".removeIdentityFromStorage()", () => {
    describe("when sender is not agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
          accounts: { signers },
        } = globalContext;

        await expect(
          identityRegistryStorage.connect(signers.anotherWallet).removeIdentityFromStorage(signers.charlieWallet.address)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is agent", () => {
      describe("when wallet is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(
            identityRegistryStorage.connect(signers.tokenAgent).removeIdentityFromStorage(ZERO_ADDRESS)
          ).to.be.revertedWith("invalid argument - zero address");
        });
      });

      describe("when wallet is not registered", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(
            identityRegistryStorage.connect(signers.tokenAgent).removeIdentityFromStorage(signers.charlieWallet.address)
          ).to.be.revertedWith("address not stored yet");
        });
      });
    });
  });

  describe(".bindIdentityRegistry()", () => {
    describe("when sender is not owner", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
          accounts: { signers },
          identities: { charlieIdentity },
        } = globalContext;

        await expect(
          identityRegistryStorage.connect(signers.anotherWallet).bindIdentityRegistry(await charlieIdentity.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when sender is owner", () => {
      describe("when identity registries is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(identityRegistryStorage.connect(signers.deployer).bindIdentityRegistry(ZERO_ADDRESS)).to.be.revertedWith(
            "invalid argument - zero address"
          );
        });
      });

      describe("when there are already 299 identity registries bound", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
            identities: { charlieIdentity },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await Promise.all(
            Array.from({ length: 299 }, () =>
              identityRegistryStorage.connect(signers.deployer).bindIdentityRegistry(ethers.Wallet.createRandom().address)
            )
          );

          await expect(
            identityRegistryStorage.connect(signers.deployer).bindIdentityRegistry(await charlieIdentity.getAddress())
          ).to.be.revertedWith("cannot bind more than 300 IR to 1 IRS");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".unbindIdentityRegistry()", () => {
    describe("when sender is not agent", () => {
      it("should revert", async () => {
        const {
          suite: { identityRegistryStorage },
          accounts: { signers },
          identities: { charlieIdentity },
        } = globalContext;

        await expect(
          identityRegistryStorage.connect(signers.anotherWallet).unbindIdentityRegistry(await charlieIdentity.getAddress())
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when sender is agent", () => {
      describe("when identity registries is zero address", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage },
            accounts: { signers },
          } = globalContext;

          await expect(identityRegistryStorage.connect(signers.deployer).unbindIdentityRegistry(ZERO_ADDRESS)).to.be.revertedWith(
            "invalid argument - zero address"
          );
        });
      });

      describe("when identity registries not bound", () => {
        it("should revert", async () => {
          const {
            suite: { identityRegistryStorage, identityRegistry },
            accounts: { signers },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await identityRegistryStorage.unbindIdentityRegistry(await identityRegistry.getAddress());

          await expect(
            identityRegistryStorage.connect(signers.deployer).unbindIdentityRegistry(await identityRegistry.getAddress())
          ).to.be.revertedWith("identity registry is not stored");

          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when identity registries is bound", () => {
        it("should unbind the identity registry", async () => {
          const {
            suite: { identityRegistryStorage, identityRegistry },
            accounts: { signers },
            identities: { charlieIdentity, bobIdentity },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await identityRegistryStorage.bindIdentityRegistry(await charlieIdentity.getAddress());
          await identityRegistryStorage.bindIdentityRegistry(await bobIdentity.getAddress());

          const tx = await identityRegistryStorage
            .connect(signers.deployer)
            .unbindIdentityRegistry(await charlieIdentity.getAddress());
          await expect(tx)
            .to.emit(identityRegistryStorage, "IdentityRegistryUnbound")
            .withArgs(await charlieIdentity.getAddress());
          const linkedIdentity = await identityRegistryStorage.linkedIdentityRegistries();
          expect(linkedIdentity[0]).to.be.equal(await identityRegistry.getAddress());
          expect(linkedIdentity[1]).to.be.equal(await bobIdentity.getAddress());
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });
});
