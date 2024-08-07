import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { ZERO_ADDRESS } from "../constants";
import { deployComplianceFixture } from "../fixtures/deploy-compliance.fixture";
import { deployFullSuiteFixture } from "../fixtures/deploy-full-suite.fixture";
import { createInstances } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("CountryRestrictModule", () => {
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

    const module = await ethers.deployContract("CountryRestrictModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const countryRestrictModule = await ethers.getContractAt("CountryRestrictModule", await proxy.getAddress());

    await compliance.addModule(await countryRestrictModule.getAddress());

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        countryRestrictModule,
      },
    };
  });

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const {
        suite: { countryRestrictModule },
      } = globalContext;

      expect(await countryRestrictModule.name()).to.equal("CountryRestrictModule");
    });
  });

  describe(".isPlugAndPlay()", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.countryRestrictModule.isPlugAndPlay()).to.be.true;
    });
  });

  describe(".canComplianceBind()", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.countryRestrictModule.canComplianceBind(await context.suite.compliance.getAddress())).to.be.true;
    });
  });

  describe(".owner", () => {
    it("should return owner", async () => {
      const context = globalContext;
      expect(await context.suite.countryRestrictModule.owner()).to.be.eq(context.accounts.signers.deployer.address);
    });
  });

  describe(".transferOwnership", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.countryRestrictModule
            .connect(context.accounts.signers.aliceWallet)
            .transferOwnership(context.accounts.signers.bobWallet.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("when calling with owner when calling directlyaccount", () => {
      it("should transfer ownership", async () => {
        const snapshotId = await ethers.provider.send("evm_snapshot");

        // given
        const context = globalContext;

        // when
        await context.suite.countryRestrictModule
          .connect(context.accounts.signers.deployer)
          .transferOwnership(context.accounts.signers.bobWallet.address);

        // then
        const owner = await context.suite.countryRestrictModule.owner();
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
          context.suite.countryRestrictModule.connect(context.accounts.signers.aliceWallet).upgradeTo(ZERO_ADDRESS)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe(".addCountryRestriction()", () => {
    describe("when the sender is a random wallet", () => {
      it("should reverts", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.anotherWallet).addCountryRestriction(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when the sender is the signers.deployer", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.deployer).addCountryRestriction(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when called via the compliance", () => {
      describe("when country is already restricted", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addCountryRestriction(uint16 country)"]).encodeFunctionData(
                "addCountryRestriction",
                [42]
              ),
              await countryRestrictModule.getAddress()
            );

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function addCountryRestriction(uint16 country)"]).encodeFunctionData(
                  "addCountryRestriction",
                  [42]
                ),
                await countryRestrictModule.getAddress()
              )
          ).to.be.revertedWith("country already restricted");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when country is not restricted", () => {
        it("should add the country restriction", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          const tx = await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addCountryRestriction(uint16 country)"]).encodeFunctionData(
                "addCountryRestriction",
                [42]
              ),
              await countryRestrictModule.getAddress()
            );

          await expect(tx)
            .to.emit(countryRestrictModule, "AddedRestrictedCountry")
            .withArgs(await compliance.getAddress(), 42);

          expect(await countryRestrictModule.isCountryRestricted(await compliance.getAddress(), 42)).to.be.true;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".removeCountryRestriction()", () => {
    describe("when the sender is a random wallet", () => {
      it("should reverts", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.anotherWallet).removeCountryRestriction(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when the sender is the signers.deployer", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.deployer).removeCountryRestriction(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when called via the compliance", () => {
      describe("when country is not restricted", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function removeCountryRestriction(uint16 country)"]).encodeFunctionData(
                  "removeCountryRestriction",
                  [42]
                ),
                await countryRestrictModule.getAddress()
              )
          ).to.be.revertedWith("country not restricted");
        });
      });

      describe("when country is restricted", () => {
        it("should remove the country restriction", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addCountryRestriction(uint16 country)"]).encodeFunctionData(
                "addCountryRestriction",
                [42]
              ),
              await countryRestrictModule.getAddress()
            );

          const tx = await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function removeCountryRestriction(uint16 country)"]).encodeFunctionData(
                "removeCountryRestriction",
                [42]
              ),
              await countryRestrictModule.getAddress()
            );

          await expect(tx)
            .to.emit(countryRestrictModule, "RemovedRestrictedCountry")
            .withArgs(await compliance.getAddress(), 42);

          expect(await countryRestrictModule.isCountryRestricted(await compliance.getAddress(), 42)).to.be.false;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".batchRestrictCountries()", () => {
    describe("when the sender is a random wallet", () => {
      it("should reverts", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.anotherWallet).batchRestrictCountries([42])).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when the sender is the signers.deployer", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.deployer).batchRestrictCountries([42])).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when called via the compliance", () => {
      describe("when attempting to restrict more than 195 countries at once", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function batchRestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
                  "batchRestrictCountries",
                  [Array.from({ length: 195 }, (_, i) => i)]
                ),
                await countryRestrictModule.getAddress()
              )
          ).to.be.revertedWith("maximum 195 can be restricted in one batch");
        });
      });

      describe("when a country is already restricted", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addCountryRestriction(uint16 country)"]).encodeFunctionData(
                "addCountryRestriction",
                [42]
              ),
              await countryRestrictModule.getAddress()
            );

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function batchRestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
                  "batchRestrictCountries",
                  [[12, 42, 67]]
                ),
                await countryRestrictModule.getAddress()
              )
          ).to.be.revertedWith("country already restricted");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      it("should add the country restriction", async () => {
        const {
          suite: { compliance, countryRestrictModule },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        const tx = await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchRestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
              "batchRestrictCountries",
              [[42, 66]]
            ),
            await countryRestrictModule.getAddress()
          );

        await expect(tx)
          .to.emit(countryRestrictModule, "AddedRestrictedCountry")
          .withArgs(await compliance.getAddress(), 42);
        await expect(tx)
          .to.emit(countryRestrictModule, "AddedRestrictedCountry")
          .withArgs(await compliance.getAddress(), 66);

        expect(await countryRestrictModule.isCountryRestricted(await compliance.getAddress(), 42)).to.be.true;
        expect(await countryRestrictModule.isCountryRestricted(await compliance.getAddress(), 66)).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".batchUnrestrictCountries()", () => {
    describe("when the sender is a random wallet", () => {
      it("should reverts", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.anotherWallet).batchUnrestrictCountries([42])).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when the sender is the signers.deployer", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryRestrictModule.connect(signers.deployer).batchUnrestrictCountries([42])).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when called via the compliance", () => {
      describe("when attempting to unrestrict more than 195 countries at once", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function batchUnrestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
                  "batchUnrestrictCountries",
                  [Array.from({ length: 195 }, (_, i) => i)]
                ),
                await countryRestrictModule.getAddress()
              )
          ).to.be.revertedWith("maximum 195 can be unrestricted in one batch");
        });
      });

      describe("when a country is not restricted", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryRestrictModule },
            accounts: { signers },
          } = globalContext;

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function batchUnrestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
                  "batchUnrestrictCountries",
                  [[12, 42, 67]]
                ),
                await countryRestrictModule.getAddress()
              )
          ).to.be.revertedWith("country not restricted");
        });
      });

      it("should remove the country restriction", async () => {
        const {
          suite: { compliance, countryRestrictModule },
          accounts: { signers },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchRestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
              "batchRestrictCountries",
              [[42, 66]]
            ),
            await countryRestrictModule.getAddress()
          );

        const tx = await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchUnrestrictCountries(uint16[] memory countries)"]).encodeFunctionData(
              "batchUnrestrictCountries",
              [[42, 66]]
            ),
            await countryRestrictModule.getAddress()
          );

        await expect(tx)
          .to.emit(countryRestrictModule, "RemovedRestrictedCountry")
          .withArgs(await compliance.getAddress(), 42);
        await expect(tx)
          .to.emit(countryRestrictModule, "RemovedRestrictedCountry")
          .withArgs(await compliance.getAddress(), 66);

        expect(await countryRestrictModule.isCountryRestricted(await compliance.getAddress(), 42)).to.be.false;
        expect(await countryRestrictModule.isCountryRestricted(await compliance.getAddress(), 66)).to.be.false;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".moduleTransferAction()", () => {
    describe("when calling from a random wallet", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(
          countryRestrictModule
            .connect(signers.anotherWallet)
            .moduleTransferAction(signers.aliceWallet.address, signers.bobWallet.address, 10)
        ).to.be.revertedWith("only bound compliance can call");
      });
    });
  });

  describe(".moduleMintAction()", () => {
    describe("when calling from a random wallet", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(
          countryRestrictModule.connect(signers.anotherWallet).moduleMintAction(signers.anotherWallet.address, 10)
        ).to.be.revertedWith("only bound compliance can call");
      });
    });
  });

  describe(".moduleBurnAction()", () => {
    describe("when calling from a random wallet", () => {
      it("should revert", async () => {
        const {
          suite: { countryRestrictModule },
          accounts: { signers },
        } = globalContext;

        await expect(
          countryRestrictModule.connect(signers.anotherWallet).moduleBurnAction(signers.anotherWallet.address, 10)
        ).to.be.revertedWith("only bound compliance can call");
      });
    });
  });
});
