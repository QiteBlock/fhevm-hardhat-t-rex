import { arrayify } from "@ethersproject/bytes";
import { Contract, Signer } from "ethers";
import OnchainID from "onchain-id-custom/";

import { ZERO_ADDRESS } from "../constants";
import { Signers } from "../signers";

export async function deployIdentityProxy(
  ethers: any,
  implementationAuthority: Contract["address"],
  managementKey: string,
  signer: Signer
) {
  const identity = await new ethers.ContractFactory(
    OnchainID.contracts.IdentityProxy.abi,
    OnchainID.contracts.IdentityProxy.bytecode,
    signer
  ).deploy(implementationAuthority, managementKey);
  await identity.waitForDeployment();

  return ethers.getContractAt("Identity", await identity.getAddress(), signer);
}

export async function deployFullSuiteFixture(ethers: any, signers: Signers, name: string, symbol: string) {
  const claimIssuerSigningKey = ethers.Wallet.createRandom();
  const aliceActionKey = ethers.Wallet.createRandom();

  // Deploy implementations
  const claimTopicsRegistryImplementation = await ethers.deployContract("ClaimTopicsRegistry", signers.deployer);
  await claimTopicsRegistryImplementation.waitForDeployment();
  const trustedIssuersRegistryImplementation = await ethers.deployContract("TrustedIssuersRegistry", signers.deployer);
  await trustedIssuersRegistryImplementation.waitForDeployment();
  const identityRegistryStorageImplementation = await ethers.deployContract(
    "IdentityRegistryStorage",
    signers.deployer
  );
  await identityRegistryStorageImplementation.waitForDeployment();
  const identityRegistryImplementation = await ethers.deployContract("IdentityRegistry", signers.deployer);
  await identityRegistryImplementation.waitForDeployment();
  const modularComplianceImplementation = await ethers.deployContract("ModularCompliance", signers.deployer);
  await modularComplianceImplementation.waitForDeployment();
  const tokenImplementation = await ethers.deployContract("Token", signers.deployer);
  await tokenImplementation.waitForDeployment();
  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    signers.deployer
  ).deploy(signers.deployer.address, true);
  await identityImplementation.waitForDeployment();
  const identityImplementationAddress = await identityImplementation.getAddress();
  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    signers.deployer
  ).deploy(identityImplementationAddress);
  await identityImplementationAuthority.waitForDeployment();

  const identityImplementationAuthorityAddress = await identityImplementationAuthority.getAddress();
  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    signers.deployer
  ).deploy(identityImplementationAuthorityAddress);
  await identityFactory.waitForDeployment();

  const trexImplementationAuthority = await ethers.deployContract(
    "TREXImplementationAuthority",
    [true, ZERO_ADDRESS, ZERO_ADDRESS],
    signers.deployer
  );
  await trexImplementationAuthority.waitForDeployment();
  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0,
  };
  const contractsStruct = {
    tokenImplementation: await tokenImplementation.getAddress(),
    ctrImplementation: await claimTopicsRegistryImplementation.getAddress(),
    irImplementation: await identityRegistryImplementation.getAddress(),
    irsImplementation: await identityRegistryStorageImplementation.getAddress(),
    tirImplementation: await trustedIssuersRegistryImplementation.getAddress(),
    mcImplementation: await modularComplianceImplementation.getAddress(),
  };
  const tx = await trexImplementationAuthority
    .connect(signers.deployer)
    .addAndUseTREXVersion(versionStruct, contractsStruct);
  await tx.wait();
  const trexImplementationAuthorityAddress = await trexImplementationAuthority.getAddress();
  const trexFactory = await ethers.deployContract(
    "TREXFactory",
    [trexImplementationAuthorityAddress, await identityFactory.getAddress()],
    signers.deployer
  );
  await trexFactory.waitForDeployment();
  await identityFactory.connect(signers.deployer).addTokenFactory(await trexFactory.getAddress());

  const claimTopicsRegistry = await ethers
    .deployContract("ClaimTopicsRegistryProxy", [trexImplementationAuthorityAddress], signers.deployer)
    .then(async (proxy) => ethers.getContractAt("ClaimTopicsRegistry", await proxy.getAddress()));
  await claimTopicsRegistry.waitForDeployment();

  const trustedIssuersRegistry = await ethers
    .deployContract("TrustedIssuersRegistryProxy", [trexImplementationAuthorityAddress], signers.deployer)
    .then(async (proxy) => ethers.getContractAt("TrustedIssuersRegistry", await proxy.getAddress()));
  await trustedIssuersRegistry.waitForDeployment();

  const identityRegistryStorage = await ethers
    .deployContract("IdentityRegistryStorageProxy", [trexImplementationAuthorityAddress], signers.deployer)
    .then(async (proxy) => ethers.getContractAt("IdentityRegistryStorage", await proxy.getAddress()));
  await identityRegistryStorage.waitForDeployment();

  const defaultCompliance = await ethers.deployContract("DefaultCompliance", signers.deployer);
  await defaultCompliance.waitForDeployment();
  const identityRegistryStorageAddress = await identityRegistryStorage.getAddress();
  const identityRegistry = await ethers
    .deployContract(
      "IdentityRegistryProxy",
      [
        trexImplementationAuthorityAddress,
        await trustedIssuersRegistry.getAddress(),
        await claimTopicsRegistry.getAddress(),
        identityRegistryStorageAddress,
      ],
      signers.deployer
    )
    .then(async (proxy) => ethers.getContractAt("IdentityRegistry", await proxy.getAddress()));
  await identityRegistry.waitForDeployment();

  const tokenOID = await deployIdentityProxy(
    ethers,
    identityImplementationAuthorityAddress,
    signers.tokenIssuer.address,
    signers.deployer
  );
  await tokenOID.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  const defaultComplianceAddress = await defaultCompliance.getAddress();
  const tokenOIDAddress = await tokenOID.getAddress();
  const token = await deployToken(
    ethers,
    name,
    symbol,
    trexImplementationAuthorityAddress,
    identityRegistryAddress,
    defaultComplianceAddress,
    tokenOIDAddress,
    signers.deployer
  );
  const tokenAddress = await token.getAddress();

  await identityRegistryStorage.connect(signers.deployer).bindIdentityRegistry(identityRegistryAddress);

  await token.connect(signers.deployer).addAgent(signers.tokenAgent.address);

  const claimTopics = [ethers.id("CLAIM_TOPIC")];
  await claimTopicsRegistry.connect(signers.deployer).addClaimTopic(claimTopics[0]);

  const claimIssuerContract = await ethers.deployContract(
    "ClaimIssuer",
    [signers.claimIssuer.address],
    signers.claimIssuer
  );
  await claimIssuerContract.waitForDeployment();
  const AbiCoder = new ethers.AbiCoder();
  await claimIssuerContract
    .connect(signers.claimIssuer)
    .addKey(ethers.keccak256(AbiCoder.encode(["address"], [claimIssuerSigningKey.address])), 3, 1);
  const claimIssuerContractAddress = await claimIssuerContract.getAddress();

  const txAdd = await trustedIssuersRegistry
    .connect(signers.deployer)
    .addTrustedIssuer(claimIssuerContractAddress, claimTopics);
  await txAdd.wait();

  const aliceIdentity = await deployIdentityProxy(
    ethers,
    identityImplementationAuthorityAddress,
    signers.aliceWallet.address,
    signers.deployer
  );
  await aliceIdentity
    .connect(signers.aliceWallet)
    .addKey(ethers.keccak256(AbiCoder.encode(["address"], [aliceActionKey.address])), 2, 1);
  const bobIdentity = await deployIdentityProxy(
    ethers,
    identityImplementationAuthorityAddress,
    signers.bobWallet.address,
    signers.deployer
  );
  const charlieIdentity = await deployIdentityProxy(
    ethers,
    identityImplementationAuthorityAddress,
    signers.charlieWallet.address,
    signers.deployer
  );

  await (await identityRegistry.connect(signers.deployer).addAgent(signers.tokenAgent.address)).wait();
  await (await identityRegistry.connect(signers.deployer).addAgent(tokenAddress)).wait();

  const aliceIdentityAddress = await aliceIdentity.getAddress();
  const bobIdentityAddress = await bobIdentity.getAddress();

  await identityRegistry
    .connect(signers.tokenAgent)
    .batchRegisterIdentity(
      [signers.aliceWallet.address, signers.bobWallet.address],
      [aliceIdentityAddress, bobIdentityAddress],
      [42, 666]
    );

  const claimForAlice = {
    data: ethers.hexlify(ethers.toUtf8Bytes("Some claim public data.")),
    issuer: claimIssuerContractAddress,
    topic: claimTopics[0],
    scheme: 1,
    identity: aliceIdentityAddress,
    signature: "",
  };
  claimForAlice.signature = await claimIssuerSigningKey.signMessage(
    arrayify(
      ethers.keccak256(
        AbiCoder.encode(
          ["address", "uint256", "bytes"],
          [claimForAlice.identity, claimForAlice.topic, claimForAlice.data]
        )
      )
    )
  );

  (
    await aliceIdentity
      .connect(signers.aliceWallet)
      .addClaim(
        claimForAlice.topic,
        claimForAlice.scheme,
        claimForAlice.issuer,
        claimForAlice.signature,
        claimForAlice.data,
        ""
      )
  ).wait();

  const claimForBob = {
    data: ethers.hexlify(ethers.toUtf8Bytes("Some claim public data.")),
    issuer: claimIssuerContractAddress,
    topic: claimTopics[0],
    scheme: 1,
    identity: bobIdentityAddress,
    signature: "",
  };
  claimForBob.signature = await claimIssuerSigningKey.signMessage(
    arrayify(
      ethers.keccak256(
        AbiCoder.encode(["address", "uint256", "bytes"], [claimForBob.identity, claimForBob.topic, claimForBob.data])
      )
    )
  );

  await (
    await bobIdentity
      .connect(signers.bobWallet)
      .addClaim(claimForBob.topic, claimForBob.scheme, claimForBob.issuer, claimForBob.signature, claimForBob.data, "")
  ).wait();

  await token.connect(signers.tokenAgent).unpause();

  return {
    accounts: {
      signers,
      claimIssuerSigningKey,
      aliceActionKey,
    },
    identities: {
      aliceIdentity,
      bobIdentity,
      charlieIdentity,
    },
    suite: {
      claimIssuerContract,
      claimTopicsRegistry,
      trustedIssuersRegistry,
      identityRegistryStorage,
      defaultCompliance,
      identityRegistry,
      tokenOID,
      token,
    },
    authorities: {
      trexImplementationAuthority,
      identityImplementationAuthority,
    },
    factories: {
      trexFactory,
      identityFactory,
    },
    implementations: {
      identityImplementation,
      claimTopicsRegistryImplementation,
      trustedIssuersRegistryImplementation,
      identityRegistryStorageImplementation,
      identityRegistryImplementation,
      modularComplianceImplementation,
      tokenImplementation,
    },
  };
}

async function deployToken(
  ethers: any,
  name: string,
  symbol: string,
  trexImplementationAuthorityAddress: string,
  identityRegistryAddress: string,
  defaultComplianceAddress: string,
  tokenOIDAddress: string,
  deployer: Signer
) {
  const tokenName = name;
  const tokenSymbol = symbol;
  const tokenDecimals = BigInt("0");
  const token = await ethers
    .deployContract(
      "TokenProxy",
      [
        trexImplementationAuthorityAddress,
        identityRegistryAddress,
        defaultComplianceAddress,
        tokenName,
        tokenSymbol,
        tokenDecimals,
        tokenOIDAddress,
      ],
      deployer
    )
    .then(async (proxy) => ethers.getContractAt("Token", await proxy.getAddress()));
  await token.waitForDeployment();
  return token;
}

export async function deploySuiteWithModularCompliancesFixture(
  ethers: any,
  trexImplementationAuthorityAddress: string
) {
  const complianceProxy = await ethers.deployContract("ModularComplianceProxy", [trexImplementationAuthorityAddress]);
  complianceProxy.waitForDeployment();
  const compliance = await ethers.getContractAt("ModularCompliance", await complianceProxy.getAddress());
  compliance.waitForDeployment();

  const complianceBeta = await ethers.deployContract("ModularCompliance");
  complianceBeta.waitForDeployment();
  await complianceBeta.init();

  return {
    compliance,
    complianceBeta,
  };
}

export async function deploySuiteWithModuleComplianceBoundToWallet(
  ethers: any,
  signers: Signers,
  name: string,
  symbol: string
) {
  const context = await deployFullSuiteFixture(ethers, signers, name, symbol);

  const compliance = await ethers.deployContract("ModularCompliance");
  await compliance.init();

  const complianceModuleA = await ethers.deployContract("CountryAllowModule");
  await compliance.addModule(await complianceModuleA.getAddress());
  const complianceModuleB = await ethers.deployContract("CountryAllowModule");
  await compliance.addModule(await complianceModuleB.getAddress());

  await compliance.bindToken(context.accounts.signers.charlieWallet.address);

  return {
    ...context,
    suite: {
      ...context.suite,
      compliance,
      complianceModuleA,
      complianceModuleB,
    },
  };
}
