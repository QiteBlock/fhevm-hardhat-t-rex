import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

import { deployFullSuiteFixture } from "../test/fixtures/deploy-full-suite.fixture";

task("task:deployDVD").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const eSigners = await ethers.getSigners();
  let signers = {
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

  const transferManager = await ethers.deployContract("DVDTransferManager");
  await transferManager.waitForDeployment();
  console.log("Transfer Manager Address : " + (await transferManager.getAddress()));
});
