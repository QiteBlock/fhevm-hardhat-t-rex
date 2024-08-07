import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

export interface Signers {
  deployer: HardhatEthersSigner;
  tokenIssuer: HardhatEthersSigner;
  tokenAgent: HardhatEthersSigner;
  tokenAdmin: HardhatEthersSigner;
  claimIssuer: HardhatEthersSigner;
  aliceWallet: HardhatEthersSigner;
  bobWallet: HardhatEthersSigner;
  charlieWallet: HardhatEthersSigner;
  davidWallet: HardhatEthersSigner;
  anotherWallet: HardhatEthersSigner;
}

let signers: Signers;

export const initSigners = async (): Promise<void> => {
  if (!signers) {
    const eSigners = await ethers.getSigners();
    signers = {
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
  }
};

export const getSigners = async (): Promise<Signers> => {
  return signers;
};
