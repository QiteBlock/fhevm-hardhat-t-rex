import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:deployDVD").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const transferManager = await ethers.deployContract("DVDTransferManager");
  await transferManager.waitForDeployment();
  console.log("Transfer Manager Address : " + (await transferManager.getAddress()));
});
