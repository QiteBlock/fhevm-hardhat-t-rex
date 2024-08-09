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

describe("CountryAllowModule", () => {
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

    const module = await ethers.deployContract("CountryAllowModule");
    const proxy = await ethers.deployContract("ModuleProxy", [
      await module.getAddress(),
      module.interface.encodeFunctionData("initialize"),
    ]);
    const countryAllowModule = await ethers.getContractAt("CountryAllowModule", await proxy.getAddress());

    await compliance.addModule(await countryAllowModule.getAddress());

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        countryAllowModule,
      },
    };
  });

  describe(".name()", () => {
    it("should return the name of the module", async () => {
      const {
        suite: { countryAllowModule },
      } = globalContext;

      expect(await countryAllowModule.name()).to.be.equal("CountryAllowModule");
    });
  });

  describe(".isPlugAndPlay()", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.countryAllowModule.isPlugAndPlay()).to.be.true;
    });
  });

  describe(".canComplianceBind()", () => {
    it("should return true", async () => {
      const context = globalContext;
      expect(await context.suite.countryAllowModule.canComplianceBind(await context.suite.compliance.getAddress())).to
        .be.true;
    });
  });

  describe(".owner", () => {
    it("should return owner", async () => {
      const context = globalContext;
      expect(await context.suite.countryAllowModule.owner()).to.be.eq(context.accounts.signers.deployer.address);
    });
  });

  describe(".transferOwnership", () => {
    describe("when calling directly", () => {
      it("should revert", async () => {
        const context = globalContext;
        await expect(
          context.suite.countryAllowModule
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
        await context.suite.countryAllowModule
          .connect(context.accounts.signers.deployer)
          .transferOwnership(context.accounts.signers.bobWallet.address);

        // then
        const owner = await context.suite.countryAllowModule.owner();
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
          context.suite.countryAllowModule.connect(context.accounts.signers.aliceWallet).upgradeTo(ZERO_ADDRESS)
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe(".batchAllowCountries()", () => {
    describe("when calling not via the Compliance contract", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(
          countryAllowModule.connect(signers.anotherWallet).batchAllowCountries([42, 66])
        ).to.be.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling as the owner", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { deployer },
        } = globalContext;

        await expect(countryAllowModule.connect(signers.deployer).batchAllowCountries([42, 66])).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via the compliance contract", () => {
      it("should allow the given countries", async () => {
        const {
          suite: { compliance, countryAllowModule },
          accounts: { signers },
        } = globalContext;
        let snapshotId = await ethers.provider.send("evm_snapshot");

        const tx = await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchAllowCountries(uint16[] calldata countries)"]).encodeFunctionData(
              "batchAllowCountries",
              [[42, 66]]
            ),
            await countryAllowModule.getAddress()
          );

        await expect(tx)
          .to.emit(countryAllowModule, "CountryAllowed")
          .withArgs(await compliance.getAddress(), 42);
        await expect(tx)
          .to.emit(countryAllowModule, "CountryAllowed")
          .withArgs(await compliance.getAddress(), 66);

        expect(await countryAllowModule.isCountryAllowed(await compliance.getAddress(), 42)).to.be.true;
        expect(await countryAllowModule.isCountryAllowed(await compliance.getAddress(), 66)).to.be.true;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".batchDisallowCountries()", () => {
    describe("when calling not via the Compliance contract", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(
          countryAllowModule.connect(signers.anotherWallet).batchDisallowCountries([42, 66])
        ).to.be.revertedWith("only bound compliance can call");
      });
    });

    describe("when calling as the owner", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryAllowModule.connect(signers.deployer).batchDisallowCountries([42, 66])).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via the compliance contract", () => {
      it("should disallow the given countries", async () => {
        const {
          suite: { compliance, countryAllowModule },
          accounts: { signers },
        } = globalContext;

        let snapshotId = await ethers.provider.send("evm_snapshot");
        const tx = await compliance
          .connect(signers.deployer)
          .callModuleFunction(
            new ethers.Interface(["function batchDisallowCountries(uint16[] calldata countries)"]).encodeFunctionData(
              "batchDisallowCountries",
              [[42, 66]]
            ),
            await countryAllowModule.getAddress()
          );

        await expect(tx)
          .to.emit(countryAllowModule, "CountryUnallowed")
          .withArgs(await compliance.getAddress(), 42);
        await expect(tx)
          .to.emit(countryAllowModule, "CountryUnallowed")
          .withArgs(await compliance.getAddress(), 66);

        expect(await countryAllowModule.isCountryAllowed(await compliance.getAddress(), 42)).to.be.false;
        expect(await countryAllowModule.isCountryAllowed(await compliance.getAddress(), 66)).to.be.false;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".addAllowedCountry()", () => {
    describe("when calling not via the Compliance contract", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryAllowModule.connect(signers.anotherWallet).addAllowedCountry(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling as the owner", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryAllowModule.connect(signers.deployer).addAllowedCountry(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via the compliance contract", () => {
      describe("when country is already allowed", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryAllowModule },
            accounts: { signers },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData(
                "addAllowedCountry",
                [42]
              ),
              await countryAllowModule.getAddress()
            );

          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData(
                  "addAllowedCountry",
                  [42]
                ),
                await countryAllowModule.getAddress()
              )
          )
            .to.be.revertedWithCustomError(countryAllowModule, "CountryAlreadyAllowed")
            .withArgs(await compliance.getAddress(), 42);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when country is not allowed", () => {
        it("should allow the given country", async () => {
          const {
            suite: { compliance, countryAllowModule },
            accounts: { signers },
          } = globalContext;
          let snapshotId = await ethers.provider.send("evm_snapshot");

          const tx = await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData(
                "addAllowedCountry",
                [42]
              ),
              await countryAllowModule.getAddress()
            );

          await expect(tx)
            .to.emit(countryAllowModule, "CountryAllowed")
            .withArgs(await compliance.getAddress(), 42);

          expect(await countryAllowModule.isCountryAllowed(await compliance.getAddress(), 42)).to.be.true;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".removeAllowedCountry()", () => {
    describe("when calling not via the Compliance contract", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryAllowModule.connect(signers.anotherWallet).removeAllowedCountry(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling as the owner", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule },
          accounts: { signers },
        } = globalContext;

        await expect(countryAllowModule.connect(signers.deployer).removeAllowedCountry(42)).to.be.revertedWith(
          "only bound compliance can call"
        );
      });
    });

    describe("when calling via the compliance contract", () => {
      describe("when country is not allowed", () => {
        it("should revert", async () => {
          const {
            suite: { compliance, countryAllowModule },
            accounts: { signers },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          await expect(
            compliance
              .connect(signers.deployer)
              .callModuleFunction(
                new ethers.Interface(["function removeAllowedCountry(uint16 country)"]).encodeFunctionData(
                  "removeAllowedCountry",
                  [42]
                ),
                await countryAllowModule.getAddress()
              )
          )
            .to.be.revertedWithCustomError(countryAllowModule, "CountryNotAllowed")
            .withArgs(await compliance.getAddress(), 42);
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when country is allowed", () => {
        it("should disallow the given country", async () => {
          const {
            suite: { compliance, countryAllowModule },
            accounts: { signers },
          } = globalContext;

          let snapshotId = await ethers.provider.send("evm_snapshot");
          await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function addAllowedCountry(uint16 country)"]).encodeFunctionData(
                "addAllowedCountry",
                [42]
              ),
              await countryAllowModule.getAddress()
            );

          const tx = await compliance
            .connect(signers.deployer)
            .callModuleFunction(
              new ethers.Interface(["function removeAllowedCountry(uint16 country)"]).encodeFunctionData(
                "removeAllowedCountry",
                [42]
              ),
              await countryAllowModule.getAddress()
            );

          await expect(tx)
            .to.emit(countryAllowModule, "CountryUnallowed")
            .withArgs(await compliance.getAddress(), 42);

          expect(await countryAllowModule.isCountryAllowed(await compliance.getAddress(), 42)).to.be.false;
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".isComplianceBound()", () => {
    describe("when the address is a bound compliance", () => {
      it("should return true", async () => {
        const {
          suite: { countryAllowModule, compliance },
        } = globalContext;

        expect(await countryAllowModule.isComplianceBound(await compliance.getAddress())).to.be.true;
      });
    });

    describe("when the address is not a bound compliance", () => {
      it("should return false", async () => {
        const {
          suite: { countryAllowModule },
        } = globalContext;

        expect(await countryAllowModule.isComplianceBound(await countryAllowModule.getAddress())).to.be.false;
      });
    });
  });

  describe(".unbindCompliance()", () => {
    describe("when sender is not a bound compliance", () => {
      it("should revert", async () => {
        const {
          suite: { countryAllowModule, compliance },
          accounts: { signers },
        } = globalContext;

        await expect(
          countryAllowModule.connect(signers.anotherWallet).unbindCompliance(await compliance.getAddress())
        ).to.be.revertedWith("only bound compliance can call");
      });
    });
  });
});
