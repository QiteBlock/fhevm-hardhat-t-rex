import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";
import OnchainID from "onchain-id-custom";

import { ZERO_ADDRESS, ZERO_HASH } from "./constants";
import { deployFullSuiteFixture } from "./fixtures/deploy-full-suite.fixture";
import { createInstances } from "./instance";
import { Signers, getSigners, initSigners } from "./signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("TREXFactory", () => {
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

  describe(".deployTREXSuite()", () => {
    describe("when called by not owner", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          factories: { trexFactory },
        } = globalContext;

        await expect(
          trexFactory.connect(signers.anotherWallet).deployTREXSuite(
            "salt",
            {
              owner: signers.deployer.address,
              name: "Token name",
              symbol: "SYM",
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [],
              tokenAgents: [],
              complianceModules: [],
              complianceSettings: [],
            },
            {
              claimTopics: [],
              issuers: [],
              issuerClaims: [],
            }
          )
        ).to.be.reverted;
      });
    });

    describe("when called by owner", () => {
      describe("when salt was already used", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;
          const snapshotId = await ethers.provider.send("evm_snapshot");

          await trexFactory.connect(signers.deployer).deployTREXSuite(
            "salt",
            {
              owner: signers.deployer.address,
              name: "Token name",
              symbol: "SYM",
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [],
              tokenAgents: [],
              complianceModules: [],
              complianceSettings: [],
            },
            {
              claimTopics: [],
              issuers: [],
              issuerClaims: [],
            }
          );

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWith("token already deployed");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });

      describe("when claim pattern is not valid", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [ZERO_ADDRESS],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWith("claim pattern not valid");
        });
      });

      describe("when configuring more than 5 claim issuers", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: Array.from({ length: 6 }, () => ZERO_ADDRESS),
                issuerClaims: Array.from({ length: 6 }, () => []),
              }
            )
          ).to.be.revertedWith("max 5 claim issuers at deployment");
        });
      });

      describe("when configuring more than 5 claim topics", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: Array.from({ length: 6 }, () => ZERO_HASH),
                issuers: [],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWith("max 5 claim topics at deployment");
        });
      });

      describe("when configuring more than 5 agents", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: Array.from({ length: 6 }, () => ZERO_ADDRESS),
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWith("max 5 agents at deployment");
        });
      });

      describe("when configuring more than 30 compliance modules", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: Array.from({ length: 31 }, () => ZERO_ADDRESS),
                complianceSettings: [],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWith("max 30 module actions at deployment");
        });
      });

      describe("when compliance configuration is not valid", () => {
        it("should revert", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory },
          } = globalContext;

          await expect(
            trexFactory.connect(signers.deployer).deployTREXSuite(
              "salt",
              {
                owner: signers.deployer.address,
                name: "Token name",
                symbol: "SYM",
                decimals: 8,
                irs: ZERO_ADDRESS,
                ONCHAINID: ZERO_ADDRESS,
                irAgents: [],
                tokenAgents: [],
                complianceModules: [],
                complianceSettings: ["0x00"],
              },
              {
                claimTopics: [],
                issuers: [],
                issuerClaims: [],
              }
            )
          ).to.be.revertedWith("invalid compliance pattern");
        });
      });

      describe("when configuration is valid", () => {
        it("should deploy a new suite", async () => {
          const {
            accounts: { signers },
            factories: { trexFactory, identityFactory },
            suite: { claimIssuerContract },
          } = globalContext;

          const snapshotId = await ethers.provider.send("evm_snapshot");
          const countryAllowModule = await ethers.deployContract("CountryAllowModule");
          await countryAllowModule.waitForDeployment();

          const tx = await trexFactory.connect(signers.deployer).deployTREXSuite(
            "salt",
            {
              owner: signers.deployer.address,
              name: "Token name",
              symbol: "SYM",
              decimals: 8,
              irs: ZERO_ADDRESS,
              ONCHAINID: ZERO_ADDRESS,
              irAgents: [signers.aliceWallet.address],
              tokenAgents: [signers.bobWallet.address],
              complianceModules: [await countryAllowModule.getAddress()],
              complianceSettings: [
                new ethers.Interface(["function batchAllowCountries(uint16[] calldata countries)"]).encodeFunctionData(
                  "batchAllowCountries",
                  [[42, 66]]
                ),
              ],
            },
            {
              claimTopics: [ethers.keccak256(ethers.toUtf8Bytes("DEMO_TOPIC"))],
              issuers: [await claimIssuerContract.getAddress()],
              issuerClaims: [[ethers.keccak256(ethers.toUtf8Bytes("DEMO_TOPIC"))]],
            }
          );
          await tx.wait();
          expect(tx).to.emit(trexFactory, "TREXSuiteDeployed");
          expect(tx).to.emit(identityFactory, "Deployed");
          expect(tx).to.emit(identityFactory, "TokenLinked");
          await ethers.provider.send("evm_revert", [snapshotId]);
        });
      });
    });
  });

  describe(".getToken()", () => {
    describe("when salt was used to deploy a token", () => {
      it("should return the token address", async () => {
        const {
          accounts: { signers },
          factories: { trexFactory },
        } = globalContext;

        const snapshotId = await ethers.provider.send("evm_snapshot");
        const tx = await trexFactory.connect(signers.deployer).deployTREXSuite(
          "salt",
          {
            owner: signers.deployer.address,
            name: "Token name",
            symbol: "SYM",
            decimals: 8,
            irs: ZERO_ADDRESS,
            ONCHAINID: ZERO_ADDRESS,
            irAgents: [],
            tokenAgents: [],
            complianceModules: [],
            complianceSettings: [],
          },
          {
            claimTopics: [],
            issuers: [],
            issuerClaims: [],
          }
        );

        const receipt = await tx.wait();
        const tokenAddress = await trexFactory.getToken("salt");
        const tokenAddressExpected = ethers.hexlify(receipt.logs[43].topics[1]);
        expect(new String(tokenAddress).toLowerCase()).to.equal(
          "0x" + tokenAddressExpected.slice(26, tokenAddressExpected.length)
        );
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".setIdFactory()", () => {
    describe("when try to input address 0", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          factories: { trexFactory },
        } = globalContext;

        await expect(trexFactory.connect(signers.deployer).setIdFactory(ZERO_ADDRESS)).to.be.revertedWith(
          "invalid argument - zero address"
        );
      });
    });

    describe("when try to input a valid address", () => {
      it("should set new Id Factory", async () => {
        const {
          accounts: { signers },
          factories: { trexFactory },
          authorities: { identityImplementationAuthority },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        const newIdFactory = await new ethers.ContractFactory(
          OnchainID.contracts.Factory.abi,
          OnchainID.contracts.Factory.bytecode,
          signers.deployer
        ).deploy(await identityImplementationAuthority.getAddress());

        const tx = await trexFactory.setIdFactory(await newIdFactory.getAddress());
        await tx.wait();
        expect(tx).to.emit(trexFactory, "IdFactorySet");
        expect(await trexFactory.getIdFactory()).to.equal(await newIdFactory.getAddress());
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });

  describe(".recoverContractOwnership()", () => {
    describe("when sender is not owner", () => {
      it("should revert", async () => {
        const {
          accounts: { signers },
          factories: { trexFactory },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");
        const tx = await trexFactory.connect(signers.deployer).deployTREXSuite(
          "salt",
          {
            owner: signers.deployer.address,
            name: "Token name",
            symbol: "SYM",
            decimals: 8,
            irs: ZERO_ADDRESS,
            ONCHAINID: ZERO_ADDRESS,
            irAgents: [],
            tokenAgents: [],
            complianceModules: [],
            complianceSettings: [],
          },
          {
            claimTopics: [],
            issuers: [],
            issuerClaims: [],
          }
        );

        const receipt = await tx.wait();
        const tokenAddressExpected = ethers.hexlify(receipt.logs[43].topics[1]);
        const tokenAddress = "0x" + tokenAddressExpected.slice(26, tokenAddressExpected.length);
        await expect(trexFactory.connect(signers.aliceWallet).recoverContractOwnership(tokenAddress, signers.aliceWallet.address))
          .to.be.reverted;
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });

    describe("when sender is owner and factory owns the trex contract", () => {
      it("should transfer ownership on the desired contract", async () => {
        const {
          accounts: { signers },
          factories: { trexFactory },
        } = globalContext;
        const snapshotId = await ethers.provider.send("evm_snapshot");

        const deployTx = await trexFactory.connect(signers.deployer).deployTREXSuite(
          "salt",
          {
            owner: await trexFactory.getAddress(),
            name: "Token name",
            symbol: "SYM",
            decimals: 8,
            irs: ZERO_ADDRESS,
            ONCHAINID: ZERO_ADDRESS,
            irAgents: [],
            tokenAgents: [],
            complianceModules: [],
            complianceSettings: [],
          },
          {
            claimTopics: [],
            issuers: [],
            issuerClaims: [],
          }
        );

        const receipt = await deployTx.wait();
        const tokenAddressExpected = ethers.hexlify(receipt.logs[43].topics[1]);
        const tokenAddress = "0x" + tokenAddressExpected.slice(26, tokenAddressExpected.length);

        const tx = await trexFactory
          .connect(signers.deployer)
          .recoverContractOwnership(tokenAddress, signers.aliceWallet.address);

        const token = await ethers.getContractAt("Token", tokenAddress);

        await expect(tx)
          .to.emit(token, "OwnershipTransferred")
          .withArgs(await trexFactory.getAddress(), signers.aliceWallet.address);

        expect(await token.owner()).to.eq(signers.aliceWallet.address);
        await ethers.provider.send("evm_revert", [snapshotId]);
      });
    });
  });
});
