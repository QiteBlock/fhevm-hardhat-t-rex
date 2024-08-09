import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";

import { ZERO_ADDRESS } from "../constants";
import {
  deployFullSuiteFixture,
  deploySuiteWithModularCompliancesFixture,
} from "../fixtures/deploy-full-suite.fixture";
import { createInstances, decrypt64 } from "../instance";
import { Signers, getSigners, initSigners } from "../signers";

let globalContext: any;
let signers: Signers;
let instances: FhevmInstance;

describe("Token - Information", () => {
  before(async () => {
    await initSigners();
    signers = await getSigners();

    const context = await deployFullSuiteFixture(ethers, signers, "TREXA", "TREXA");
    instances = await createInstances(signers);
    const { compliance, complianceBeta } = await deploySuiteWithModularCompliancesFixture(
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

    globalContext = {
      ...context,
      suite: {
        ...context.suite,
        compliance,
        complianceBeta,
      },
    };
  });

  describe(".setName()", () => {
    describe("when the caller is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).setName("My Token")).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when the caller is the owner", () => {
      describe("when the name is empty", () => {
        it("should revert", async () => {
          const {
            suite: { token },
          } = globalContext;
          await expect(token.setName("")).to.be.revertedWith("invalid argument - empty string");
        });
      });

      it("should set the name", async () => {
        const {
          suite: { token },
        } = globalContext;
        const tx = await token.setName("Updated Test Token");
        await expect(tx)
          .to.emit(token, "UpdatedTokenInformation")
          .withArgs(
            "Updated Test Token",
            await token.symbol(),
            await token.decimals(),
            await token.version(),
            await token.onchainID()
          );
        expect(await token.name()).to.equal("Updated Test Token");
      });
    });
  });

  describe(".setSymbol()", () => {
    describe("when the caller is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).setSymbol("UpdtTK")).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when the caller is the owner", () => {
      describe("when the symbol is empty", () => {
        it("should revert", async () => {
          const {
            suite: { token },
          } = globalContext;
          await expect(token.setSymbol("")).to.be.revertedWith("invalid argument - empty string");
        });
      });

      it("should set the symbol", async () => {
        const {
          suite: { token },
        } = globalContext;
        const tx = await token.setSymbol("UpdtTK");
        await expect(tx)
          .to.emit(token, "UpdatedTokenInformation")
          .withArgs(
            await token.name(),
            "UpdtTK",
            await token.decimals(),
            await token.version(),
            await token.onchainID()
          );
        expect(await token.symbol()).to.equal("UpdtTK");
      });
    });
  });

  describe(".setOnchainID()", () => {
    describe("when the caller is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).setOnchainID(ZERO_ADDRESS)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("when the caller is the owner", () => {
      it("should set the onchainID", async () => {
        const {
          suite: { token },
        } = globalContext;
        const tx = await token.setOnchainID(ZERO_ADDRESS);
        await expect(tx)
          .to.emit(token, "UpdatedTokenInformation")
          .withArgs(
            await token.name(),
            await token.symbol(),
            await token.decimals(),
            await token.version(),
            ZERO_ADDRESS
          );
        expect(await token.onchainID()).to.equal(ZERO_ADDRESS);
      });
    });
  });

  describe(".setIdentityRegistry()", () => {
    describe("when the caller is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).setIdentityRegistry(ZERO_ADDRESS)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  describe(".totalSupply()", () => {
    it("should return the total supply", async () => {
      const {
        suite: { token },
        accounts: { signers },
      } = globalContext;

      const balanceHandleAlice = await token.balanceOf(signers.aliceWallet.address);
      const balanceAlice = await decrypt64(balanceHandleAlice);
      const balanceHandleBob = await token.balanceOf(signers.bobWallet.address);
      const balanceBob = await decrypt64(balanceHandleBob);
      const balanceToCompare = balanceBob + balanceAlice;
      const totalSupplyHandle = await token.totalSupply();
      const totalSupply = await decrypt64(totalSupplyHandle);
      expect(totalSupply).to.equal(balanceToCompare);
    });
  });

  describe(".setCompliance", () => {
    describe("when the caller is not the owner", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).setCompliance(ZERO_ADDRESS)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  describe(".compliance()", () => {
    it("should return the compliance address", async () => {
      const {
        suite: { token, compliance },
      } = globalContext;
      const complianceAddress = await compliance.getAddress();
      await token.setCompliance(complianceAddress);
      expect(await token.compliance()).to.equal(complianceAddress);
    });
  });

  describe(".pause()", () => {
    describe("when the caller is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).pause()).to.be.revertedWith(
          "AgentRole: caller does not have the Agent role"
        );
      });
    });

    describe("when the caller is an agent", () => {
      describe("when the token is not paused", () => {
        it("should pause the token", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;
          const tx = await token.connect(signers.tokenAgent).pause();
          await expect(tx).to.emit(token, "Paused").withArgs(signers.tokenAgent.address);
          expect(await token.paused()).to.be.true;
        });
      });

      describe("when the token is paused", () => {
        it("should revert", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;
          try {
            await token.connect(signers.tokenAgent).pause();
          } catch (error) {
            expect(error.message).to.include("Pausable: paused");
          } finally {
            await token.connect(signers.tokenAgent).unpause();
          }
        });
      });
    });
  });

  describe(".unpause()", () => {
    describe("when the caller is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(token.connect(signers.anotherWallet).unpause()).to.be.revertedWith(
          "AgentRole: caller does not have the Agent role"
        );
      });
    });

    describe("when the caller is an agent", () => {
      describe("when the token is paused", () => {
        it("should unpause the token", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;
          await token.connect(signers.tokenAgent).pause();
          const tx = await token.connect(signers.tokenAgent).unpause();
          await expect(tx).to.emit(token, "Unpaused").withArgs(signers.tokenAgent.address);
          expect(await token.paused()).to.be.false;
        });
      });

      describe("when the token is not paused", () => {
        it("should revert", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;
          await expect(token.connect(signers.tokenAgent).unpause()).to.be.revertedWith("Pausable: not paused");
        });
      });
    });
  });

  describe(".setAddressFrozen", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(
          token.connect(signers.anotherWallet).setAddressFrozen(signers.anotherWallet.address, true)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });
  });

  describe(".freezePartialTokens", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(
          token.connect(signers.anotherWallet).freezePartialTokens(signers.anotherWallet.address, 1)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is an agent", () => {
      describe("when amounts exceed current balance", () => {
        it("should revert", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;
          const balanceFrozenBefore = await token.getFrozenTokens(signers.anotherWallet.address);
          const inputAgent = instances.tokenAgent.createEncryptedInput(
            await token.getAddress(),
            signers.tokenAgent.address
          );
          inputAgent.add64(BigInt(1));
          const encryptedFreezeAmount = inputAgent.encrypt();
          const t1 = await token
            .connect(signers.tokenAgent)
            ["freezePartialTokens(address,bytes32,bytes)"](
              signers.anotherWallet.address,
              encryptedFreezeAmount.handles[0],
              encryptedFreezeAmount.inputProof
            );
          await t1.wait();
          const balanceFrozen = await token.getFrozenTokens(signers.anotherWallet.address);
          const balance = await decrypt64(balanceFrozen);
          expect(balance).to.be.equal(balanceFrozenBefore);
        });
      });
    });
  });

  describe(".unfreezePartialTokens", () => {
    describe("when sender is not an agent", () => {
      it("should revert", async () => {
        const {
          suite: { token },
          accounts: { signers },
        } = globalContext;
        await expect(
          token.connect(signers.anotherWallet).unfreezePartialTokens(signers.anotherWallet.address, 1)
        ).to.be.revertedWith("AgentRole: caller does not have the Agent role");
      });
    });

    describe("when sender is an agent", () => {
      describe("when amounts exceed current frozen balance", () => {
        it("should revert", async () => {
          const {
            suite: { token },
            accounts: { signers },
          } = globalContext;
          const balanceFrozenBefore = await token.getFrozenTokens(signers.anotherWallet.address);
          const balanceBefore = await decrypt64(balanceFrozenBefore);
          const inputAgent = instances.tokenAgent.createEncryptedInput(
            await token.getAddress(),
            signers.tokenAgent.address
          );
          inputAgent.add64(BigInt(1));
          const encryptedFreezeAmount = inputAgent.encrypt();
          const t1 = await token
            .connect(signers.tokenAgent)
            ["unfreezePartialTokens(address,bytes32,bytes)"](
              signers.anotherWallet.address,
              encryptedFreezeAmount.handles[0],
              encryptedFreezeAmount.inputProof
            );
          await t1.wait();
          const balanceFrozen = await token.getFrozenTokens(signers.anotherWallet.address);
          const balance = await decrypt64(balanceFrozen);
          expect(balance).to.be.equal(balanceBefore);
        });
      });
    });
  });
});
