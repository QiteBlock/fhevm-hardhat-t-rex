import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import { deployFullSuiteFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("TrexImplementationAuthority", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);

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

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
      },
    };
  });

  describe(".setTREXFactory()", () => {
    describe("When not called by the owner", () => {
      it("Should revert", async () => {
        const {
          authorities: { trexImplementationAuthority },
          accounts: { signers },
        } = globalContext;
        await expect(trexImplementationAuthority.connect(signers.anotherWallet).setTREXFactory(ZERO_ADDRESS)).to.be.reverted;
      });
    });

    describe("When called by the owner", () => {
      describe("When the authority has reference status true", () => {
        describe("When the trex factory to add is not using this authority contract", () => {
          it("Should revert for invalid link between the factory and the authority", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
              implementations,
            } = globalContext;
            const snapshotId = await ethers.provider.send("evm_snapshot");

            const otherTrexImplementationAuthority = await ethers.deployContract(
              "TREXImplementationAuthority",
              [true, ZERO_ADDRESS, ZERO_ADDRESS],
              signers.deployer
            );
            const versionStruct = {
              major: 4,
              minor: 0,
              patch: 0,
            };
            const contractsStruct = {
              tokenImplementation: await implementations.tokenImplementation.getAddress(),
              ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
              irImplementation: await implementations.identityRegistryImplementation.getAddress(),
              irsImplementation: await implementations.identityRegistryStorageImplementation.getAddress(),
              tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
              mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
            };
            await otherTrexImplementationAuthority.connect(signers.deployer).addAndUseTREXVersion(versionStruct, contractsStruct);

            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await otherTrexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );

            await expect(trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress())).to.be.revertedWith(
              "only reference contract can call"
            );
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });

        describe("When the trex factory to add is using this authority contract", () => {
          it("should set the trex factory address", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
            } = globalContext;
            const snapshotId = await ethers.provider.send("evm_snapshot");

            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );

            const tx = await trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress());
            await expect(tx)
              .to.emit(trexImplementationAuthority, "TREXFactorySet")
              .withArgs(await trexFactory.getAddress());
            expect(await trexImplementationAuthority.getTREXFactory()).to.equal(await trexFactory.getAddress());
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });

  describe(".setIAFactory()", () => {
    describe("When not called by the owner", () => {
      it("Should revert", async () => {
        const {
          authorities: { trexImplementationAuthority },
          accounts: { signers },
        } = globalContext;
        await expect(trexImplementationAuthority.connect(signers.anotherWallet).setIAFactory(ZERO_ADDRESS)).to.be.reverted;
      });
    });

    describe("When called by the owner", () => {
      describe("When the authority has reference status true", () => {
        describe("When the trex factory to add is using this authority contract", () => {
          it("should set the trex factory address", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
            } = globalContext;

            const snapshotId = await ethers.provider.send("evm_snapshot");
            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );
            await trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress());

            const implementationAuthorityFactory = await ethers.deployContract(
              "TREXImplementationAuthority",
              [true, ZERO_ADDRESS, ZERO_ADDRESS],
              signers.deployer
            );

            const tx = await trexImplementationAuthority.setIAFactory(await implementationAuthorityFactory.getAddress());
            await expect(tx)
              .to.emit(trexImplementationAuthority, "IAFactorySet")
              .withArgs(await implementationAuthorityFactory.getAddress());

            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });

  describe(".fetchVersion()", () => {
    describe("when called on the reference contract", () => {
      it("should revert because the reference contract cannot fetch its own versions", async () => {
        const {
          authorities: { trexImplementationAuthority },
        } = globalContext;

        const versionStruct = {
          major: 4,
          minor: 0,
          patch: 0,
        };

        await expect(trexImplementationAuthority.fetchVersion(versionStruct)).to.be.revertedWith(
          "cannot call on reference contract"
        );
      });
    });

    describe("when version were already fetched", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          authorities: { trexImplementationAuthority },
          factories: { identityFactory },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        const trexFactory = await ethers.deployContract(
          "TREXFactory",
          [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
          signers.deployer
        );

        const otherTrexImplementationAuthority = await ethers.deployContract(
          "TREXImplementationAuthority",
          [false, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
          signers.deployer
        );

        const versionStruct = {
          major: 4,
          minor: 0,
          patch: 0,
        };

        await otherTrexImplementationAuthority.fetchVersion(versionStruct);

        await expect(otherTrexImplementationAuthority.fetchVersion(versionStruct)).to.be.revertedWith("version fetched already");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when version should be setup", () => {
      it("should fetch and set the versions of the implementation from the reference contract", async () => {
        const {
          accounts: { signers },
          authorities: { trexImplementationAuthority },
          factories: { identityFactory },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        const trexFactory = await ethers.deployContract(
          "TREXFactory",
          [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
          signers.deployer
        );

        const otherTrexImplementationAuthority = await ethers.deployContract(
          "TREXImplementationAuthority",
          [false, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
          signers.deployer
        );

        const versionStruct = {
          major: 4,
          minor: 0,
          patch: 0,
        };

        const tx = await otherTrexImplementationAuthority.fetchVersion(versionStruct);
        await tx.wait();
        expect(tx).to.emit(otherTrexImplementationAuthority, "TREXVersionFetched");
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".addTREXVersion()", () => {
    describe("when called not as owner", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          authorities: { trexImplementationAuthority },
          implementations,
        } = globalContext;

        const versionStruct = {
          major: 4,
          minor: 0,
          patch: 1,
        };
        const contractsStruct = {
          tokenImplementation: await implementations.tokenImplementation.getAddress(),
          ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
          irImplementation: await implementations.identityRegistryImplementation.getAddress(),
          irsImplementation: ZERO_ADDRESS,
          tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
          mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
        };

        await expect(trexImplementationAuthority.connect(signers.anotherWallet).addTREXVersion(versionStruct, contractsStruct)).to
          .be.reverted;
      });
    });

    describe("when called as owner", () => {
      describe("when called on a non-reference contract", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            authorities: { trexImplementationAuthority },
            factories: { identityFactory },
            implementations,
          } = globalContext;
          const snapshotId = await ethers.provider.send("evm_snapshot");

          const trexFactory = await ethers.deployContract(
            "TREXFactory",
            [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
            signers.deployer
          );

          const otherTrexImplementationAuthority = await ethers.deployContract(
            "TREXImplementationAuthority",
            [false, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
            signers.deployer
          );

          const versionStruct = {
            major: 4,
            minor: 0,
            patch: 0,
          };
          const contractsStruct = {
            tokenImplementation: await implementations.tokenImplementation.getAddress(),
            ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
            irImplementation: await implementations.identityRegistryImplementation.getAddress(),
            irsImplementation: await implementations.identityRegistryStorageImplementation.getAddress(),
            tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
            mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
          };

          await expect(otherTrexImplementationAuthority.addTREXVersion(versionStruct, contractsStruct)).to.be.revertedWith(
            "ONLY reference contract can add versions"
          );
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when called on a reference contract", () => {
        describe("when version were already added", () => {
          it("should revert", async () => {
            const {
              authorities: { trexImplementationAuthority },
              implementations,
            } = globalContext;

            const versionStruct = {
              major: 4,
              minor: 0,
              patch: 0,
            };
            const contractsStruct = {
              tokenImplementation: await implementations.tokenImplementation.getAddress(),
              ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
              irImplementation: await implementations.identityRegistryImplementation.getAddress(),
              irsImplementation: await implementations.identityRegistryStorageImplementation.getAddress(),
              tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
              mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
            };

            await expect(trexImplementationAuthority.addTREXVersion(versionStruct, contractsStruct)).to.be.revertedWith(
              "version already exists"
            );
          });
        });

        describe("when a contract implementation address is the zero address", () => {
          it("should revert", async () => {
            const {
              authorities: { trexImplementationAuthority },
              implementations,
            } = globalContext;

            const versionStruct = {
              major: 4,
              minor: 0,
              patch: 1,
            };
            const contractsStruct = {
              tokenImplementation: await implementations.tokenImplementation.getAddress(),
              ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
              irImplementation: await implementations.identityRegistryImplementation.getAddress(),
              irsImplementation: ZERO_ADDRESS,
              tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
              mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
            };

            await expect(trexImplementationAuthority.addTREXVersion(versionStruct, contractsStruct)).to.be.revertedWith(
              "invalid argument - zero address"
            );
          });
        });
      });
    });
  });

  describe(".useTREXVersion()", () => {
    describe("when called not as owner", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          authorities: { trexImplementationAuthority },
        } = globalContext;

        const versionStruct = {
          major: 4,
          minor: 0,
          patch: 0,
        };

        await expect(trexImplementationAuthority.connect(signers.anotherWallet).useTREXVersion(versionStruct)).to.be.reverted;
      });
    });

    describe("when called as owner", () => {
      describe("when version is already in use", () => {
        it("should revert", async () => {
          const {
            authorities: { trexImplementationAuthority },
          } = globalContext;

          const versionStruct = {
            major: 4,
            minor: 0,
            patch: 0,
          };

          await expect(trexImplementationAuthority.useTREXVersion(versionStruct)).to.be.revertedWith("version already in use");
        });
      });

      describe("when version does not exist", () => {
        it("should revert", async () => {
          const {
            authorities: { trexImplementationAuthority },
          } = globalContext;

          const versionStruct = {
            major: 4,
            minor: 0,
            patch: 1,
          };

          await expect(trexImplementationAuthority.useTREXVersion(versionStruct)).to.be.revertedWith(
            "invalid argument - non existing version"
          );
        });
      });
    });
  });

  describe(".changeImplementationAuthority()", () => {
    describe("when token to update is the zero address", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          authorities: { trexImplementationAuthority },
        } = globalContext;

        await expect(
          trexImplementationAuthority.changeImplementationAuthority(ZERO_ADDRESS, signers.anotherWallet.address)
        ).to.be.revertedWith("invalid argument - zero address");
      });
    });

    describe("whe new authority is the zero address", () => {
      describe("when called on a non-reference authority contract", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            authorities: { trexImplementationAuthority },
            factories: { identityFactory },
            suite: { token },
          } = globalContext;
          const snapshotId = await ethers.provider.send("evm_snapshot");

          const trexFactory = await ethers.deployContract(
            "TREXFactory",
            [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
            signers.deployer
          );

          const otherTrexImplementationAuthority = await ethers.deployContract(
            "TREXImplementationAuthority",
            [false, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
            signers.deployer
          );

          await expect(
            otherTrexImplementationAuthority.changeImplementationAuthority(await token.getAddress(), ZERO_ADDRESS)
          ).to.be.revertedWith("only reference contract can deploy new IAs");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when called on a reference authority contract", () => {
        describe("when caller is not owner of the token (or any contract of the suite)", () => {
          it("should revert", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              suite: { token },
            } = globalContext;

            await expect(
              trexImplementationAuthority
                .connect(signers.anotherWallet)
                .changeImplementationAuthority(await token.getAddress(), ZERO_ADDRESS)
            ).to.be.revertedWith("caller NOT owner of all contracts impacted");
          });
        });

        describe("when caller is owner of every contract of the suite of the token", () => {
          it("should deploy a new authority contract", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
              suite: { token },
            } = globalContext;
            const snapshotId = await ethers.provider.send("evm_snapshot");

            const compliance = await ethers.deployContract(
              "ModularComplianceProxy",
              [await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await token.setCompliance(await compliance.getAddress());

            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );

            const implementationAuthorityFactory = await ethers.deployContract(
              "IAFactory",
              [await trexFactory.getAddress()],
              signers.deployer
            );
            await trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress());
            await trexImplementationAuthority.setIAFactory(await implementationAuthorityFactory.getAddress());

            const tx = await trexImplementationAuthority.changeImplementationAuthority(await token.getAddress(), ZERO_ADDRESS);
            await tx.wait();
            expect(tx).to.emit(trexImplementationAuthority, "ImplementationAuthorityChanged");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });

    describe("when new authority is not the zero address", () => {
      describe("when caller is owner of every contract of the suite of the token", () => {
        describe("when version used by the reference contract is not the same as currently deployed implementations", () => {
          it("should revert", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
              suite: { token },
              implementations,
            } = globalContext;
            const snapshotId = await ethers.provider.send("evm_snapshot");

            const compliance = await ethers.deployContract(
              "ModularComplianceProxy",
              [await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await token.setCompliance(await compliance.getAddress());

            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );

            const implementationAuthorityFactory = await ethers.deployContract(
              "IAFactory",
              [await trexFactory.getAddress()],
              signers.deployer
            );
            await trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress());
            await trexImplementationAuthority.setIAFactory(await implementationAuthorityFactory.getAddress());

            const otherTrexImplementationAuthority = await ethers.deployContract(
              "TREXImplementationAuthority",
              [true, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await otherTrexImplementationAuthority.addAndUseTREXVersion(
              { major: 4, minor: 0, patch: 1 },
              {
                tokenImplementation: await implementations.tokenImplementation.getAddress(),
                ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
                irImplementation: await implementations.identityRegistryImplementation.getAddress(),
                irsImplementation: await implementations.identityRegistryStorageImplementation.getAddress(),
                tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
                mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
              }
            );

            await expect(
              trexImplementationAuthority.changeImplementationAuthority(
                await token.getAddress(),
                await otherTrexImplementationAuthority.getAddress()
              )
            ).to.be.revertedWith("version of new IA has to be the same as current IA");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });

        describe("when the new implementation authority is a reference contract but not the current one", () => {
          it("should revert", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
              suite: { token },
              implementations,
            } = globalContext;

            const snapshotId = await ethers.provider.send("evm_snapshot");
            const compliance = await ethers.deployContract(
              "ModularComplianceProxy",
              [await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await token.setCompliance(await compliance.getAddress());

            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );

            const implementationAuthorityFactory = await ethers.deployContract(
              "IAFactory",
              [await trexFactory.getAddress()],
              signers.deployer
            );
            await trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress());
            await trexImplementationAuthority.setIAFactory(await implementationAuthorityFactory.getAddress());

            const otherTrexImplementationAuthority = await ethers.deployContract(
              "TREXImplementationAuthority",
              [true, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await otherTrexImplementationAuthority.addAndUseTREXVersion(
              { major: 4, minor: 0, patch: 0 },
              {
                tokenImplementation: await implementations.tokenImplementation.getAddress(),
                ctrImplementation: await implementations.claimTopicsRegistryImplementation.getAddress(),
                irImplementation: await implementations.identityRegistryImplementation.getAddress(),
                irsImplementation: await implementations.identityRegistryStorageImplementation.getAddress(),
                tirImplementation: await implementations.trustedIssuersRegistryImplementation.getAddress(),
                mcImplementation: await implementations.modularComplianceImplementation.getAddress(),
              }
            );

            await expect(
              trexImplementationAuthority.changeImplementationAuthority(
                await token.getAddress(),
                await otherTrexImplementationAuthority.getAddress()
              )
            ).to.be.revertedWith("new IA is NOT reference contract");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });

        describe("when the new implementation authority is not a reference contract and is not valid", () => {
          it("should revert", async () => {
            const {
              accounts: { signers },
              authorities: { trexImplementationAuthority },
              factories: { identityFactory },
              suite: { token },
            } = globalContext;
            const snapshotId = await ethers.provider.send("evm_snapshot");

            const compliance = await ethers.deployContract(
              "ModularComplianceProxy",
              [await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await token.setCompliance(await compliance.getAddress());

            const trexFactory = await ethers.deployContract(
              "TREXFactory",
              [await trexImplementationAuthority.getAddress(), await identityFactory.getAddress()],
              signers.deployer
            );

            const implementationAuthorityFactory = await ethers.deployContract(
              "IAFactory",
              [await trexFactory.getAddress()],
              signers.deployer
            );
            await trexImplementationAuthority.setTREXFactory(await trexFactory.getAddress());
            await trexImplementationAuthority.setIAFactory(await implementationAuthorityFactory.getAddress());

            const otherTrexImplementationAuthority = await ethers.deployContract(
              "TREXImplementationAuthority",
              [false, await trexFactory.getAddress(), await trexImplementationAuthority.getAddress()],
              signers.deployer
            );
            await otherTrexImplementationAuthority.fetchVersion({ major: 4, minor: 0, patch: 0 });
            await otherTrexImplementationAuthority.useTREXVersion({ major: 4, minor: 0, patch: 0 });

            await expect(
              trexImplementationAuthority.changeImplementationAuthority(
                await token.getAddress(),
                await otherTrexImplementationAuthority.getAddress()
              )
            ).to.be.revertedWith("invalid IA");
            await ethers.provider.send("evm_revert", [snapshotId]);
          });
        });
      });
    });
  });
});
