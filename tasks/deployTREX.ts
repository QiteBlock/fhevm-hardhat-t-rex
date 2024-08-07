import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

import { deployFullSuiteFixture } from "../test/fixtures/deploy-full-suite.fixture";

task("task:deployTREX")
  .addParam("tokenName", "The token name")
  .addParam("tokenSymbol", "The token symbol")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const eSigners = await ethers.getSigners();
    const signers = {
      deployer: eSigners[0],
      tokenIssuer: eSigners[1],
      tokenAgent: eSigners[2],
      tokenAdmin: eSigners[3],
      claimIssuer: eSigners[4],
      aliceWallet: eSigners[5],
      bobWallet: eSigners[6],
      charlieWallet: eSigners[7],
      davidWallet: eSigners[8],
      anotherWallet: eSigners[9],
    };
    const context = await deployFullSuiteFixture(ethers, signers, taskArguments.tokenName, taskArguments.tokenSymbol);
    console.log("Token Address : " + (await context.suite.token.getAddress()));
  });
