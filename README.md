# T-Rex Token Protocol - Enhanced Privacy Edition

## Overview

This repository contains the upgraded version of the T-Rex Token protocol, integrating Fully Homomorphic Encryption Virtual Machine (FHEVM) technology. The protocol is designed to enhance the privacy of token transactions by hiding the transfer amounts, balances, and total supply of the T-Rex Token.

## What is the problem ?

### Privacy Enhancement

In traditional blockchain systems like Ethereum, all transaction details are publicly visible on the blockchain. This includes:

- **Transfer Amounts**: How much of a token is being transferred from one address to another.
- **Balances**: The total amount of tokens held by each address.
- **Total Supply**: The total amount of tokens in circulation.

While this transparency is beneficial for auditability and trust, it can compromise privacy. Anyone can trace transactions, identify patterns, and potentially link addresses to real-world identities. This is particularly concerning for individuals and organizations who prioritize confidentiality in their financial activities.

### Benefits of Hiding Information

1. **Enhanced Privacy**: By hiding transfer amounts, balances, and total supply using FHEVM (Fully Homomorphic Encryption Virtual Machine), the T-Rex Token protocol ensures that sensitive financial data remains private. This is crucial for users who need to conduct transactions without exposing their financial details to the public.

2. **Preventing Financial Surveillance**: In a fully transparent blockchain, it’s easy for anyone to monitor the financial activities of others. By encrypting these details, the T-Rex Token protocol makes it significantly harder for third parties to conduct financial surveillance or track user behavior.

3. **Increased Security**: When financial details are hidden, it reduces the risk of targeted attacks. For example, if a malicious actor can’t see how much wealth is stored in an address, they have less incentive to target that address.

4. **Confidential Business Transactions**: For businesses, maintaining confidentiality in their transactions is critical. Hiding transaction details ensures that business strategies, supply chain payments, and other sensitive activities remain confidential, protecting competitive advantages.

### How Does It Make the T-Rex Token Protocol Better?

1. **Adoption in Privacy-Conscious Industries**: By addressing privacy concerns, the T-Rex Token protocol becomes more appealing to industries and users who require confidentiality, such as healthcare, finance, and supply chain management.

2. **Compliance with Privacy Regulations**: As global regulations increasingly emphasize the protection of personal data, the T-Rex Token protocol’s privacy features can help users and organizations comply with these laws while still leveraging blockchain technology.

3. **Future-Proofing**: Privacy is becoming a critical aspect of blockchain technology as it evolves. By integrating advanced privacy features now, the T-Rex Token protocol positions itself at the forefront of this trend, making it more relevant in the future.

### How Does It Work?

1. **Replacement of Standard Data Types in the T-Rex token**: 
    - The standard `uint256` type used in the ERC20 token contract for storing balances, transfer amounts, and approval amounts has been replaced with a new encrypted data type, `euint64`.
    - `euint64` is a type introduced by FHEVM that represents an encrypted unsigned 64-bit integer. This encryption ensures that all numerical values related to token operations are kept private, even as they are processed within smart contracts.

```javascript
    /// @dev ERC20 basic variables
    mapping(address => euint64) internal _balances;
    mapping(address => mapping(address => euint64)) internal _allowances;
    euint64 internal _totalSupply;
    
    /// @dev Variables of freeze and pause functions
    mapping(address => bool) internal _frozen;
    mapping(address => euint64) internal _frozenTokens;
```
2. **Adapt functions in the T-Rex token that use those values**: 

Example on the approve function : 

```javascript
    // Function needed to be able to send encrypted amount from an EOA
    function approve(
        address spender,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external override returns (bool) {
        approve(spender, TFHE.asEuint64(encryptedAmount, inputProof));
        return true;
    }

    function approve(address _spender, euint64 _amount) public returns (bool) {
        // Sender need to have the rights to access _amount cypher
        require(TFHE.isSenderAllowed(_amount));
        _approve(msg.sender, _spender, _amount);
        emit Approval(msg.sender, _spender);
        return true;
    }

    function _approve(address _owner, address _spender, euint64 _amount) internal virtual {
        require(_owner != address(0), "ERC20: approve from the zero address");
        require(_spender != address(0), "ERC20: approve to the zero address");
        _allowances[_owner][_spender] = _amount;
        // Need to give the rights to _owner, _spender and the contract to access this new cypher
        TFHE.allow(_allowances[_owner][_spender], address(this));
        TFHE.allow(_allowances[_owner][_spender], _owner);
        TFHE.allow(_allowances[_owner][_spender], _spender);
    }
```

One of the most challenging aspects of adapting the T-Rex Token protocol to use FHEVM is ensuring that the system accurately checks whether a token transfer is permitted. In the original ERC20 standard, checking the right to transfer tokens is relatively straightforward, as all relevant data—like balances, allowances, and compliance rules—are stored as plain uint256 values and can be easily compared and verified.

However, with the introduction of encrypted data types like euint64, the process becomes significantly more complex:

- Encrypted Data: Since balances, transfer amounts, and allowances are now encrypted, they cannot be directly compared or processed in the same way as plain integers. Special cryptographic methods must be used to ensure that compliance checks are accurate while preserving the privacy of the data.
- Complex Compliance Requirements: The T-Rex Token protocol, like many other advanced token systems, include various compliance modules that enforce rules such as:
    - **ConditionalTransferModule** : this module allows to require the pre-validation of a transfer before allowing it to be executed.
    - **CountryAllowModule** : This module aims to define the allowed country that an investors can trade the token. 
    - **CountryRestrictModule** : This module aims to define the restricted country that an investors can trade the token. 
    - **MaxBalanceModule** : Aimed at regulating the concentration of token ownership, this module enables the setting of maximum token balances that an investor can hold. Unlike other balance restrictions that might apply at the wallet level, this module enforces the limit at the identity level, ensuring that an investor cannot circumvent the rule by distributing tokens across multiple wallets. This feature is particularly useful for maintaining a broad distribution of token ownership or complying with regulatory caps on investment amounts.
    - **SupplyLimitModule** : This module aims to define the total supply that a token can have. 
    - **TimeExchangeLimitsModule** : This module enforces restrictions on the volume of tokens a holder can transfer within a specified timeframe. The timeframe is customizable, allowing issuers to set daily, weekly, monthly, or any custom period limits. This flexibility ensures adaptability to a wide range of regulatory and policy requirements.
    - **ExchangeMonthlyLimitsModule** : Similar to the Time-Based Exchange Limits module, but with a fixed monthly timeframe. This optimization simplifies the module's logic, offering a gas-efficient solution for monthly transfer volume restrictions to CEXs.
    - **TimeTransfersLimitsModule** : This module limits the total volume of transfers an investor can execute within a customizable timeframe, focusing on peer-to-peer transactions rather than deposits to CEXs. It ensures that the overall volume of transfers remains within predefined limits, excluding transfers between an investor's own wallets to prevent self-transfer loopholes.
    - **TransferFeesModule** : This module introduces the ability to levy fees on token transfers, offering token issuers the flexibility to set the fee percentage and designate a specific wallet to collect these fees. It also allows for the exclusion of certain addresses from the fee mechanism, providing a way to tailor the fee structure to accommodate operational needs or incentivize particular transaction patterns within the ecosystem.
    - **TransferRestrictModule** : Designed to enforce transfer restrictions exclusively to whitelisted addresses, this module ensures that tokens can only be sent to approved destinations. This capability is crucial for scenarios where token transfers need to be routed through intermediary contracts for additional off-chain verifications or other compliance checks, even if the recipient address belongs to an eligible investor. It enhances control over token circulation, aligning with specific compliance or operational strategies.

To maintain these compliance requirements in the context of encrypted data, significant modifications are necessary:
- **Encrypted Compliance Checks** : Each compliance module must be adapted to work with encrypted data. This may involve using homomorphic encryption techniques that allow certain computations to be performed on encrypted data without needing to decrypt it. These checks ensure that the rules are enforced without compromising the privacy provided by euint64.
- **Modular Redesign** : The existing compliance modules, which were originally designed to work with plain uint256 data, need to be redesigned to integrate with the FHEVM environment. This might involve breaking down the logic into smaller, more modular components that can work within the constraints of encrypted operations.
- **Performance Considerations** : Performing operations on encrypted data can be computationally intensive. As a result, the compliance modules must be optimized to minimize the performance impact while still ensuring that all necessary checks are performed.

## Tech Stack

- **Smart Contracts**: Solidity
- **Blockchain**: Ethereum-compatible (FHEVM)
- **Development Environment**: Hardhat
- **Package Manager**: pnpm

## Prerequisites

Before getting started, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v20.16.0 or later)
- [pnpm](https://pnpm.io/) (v9.6.0 or later)
- [Hardhat](https://hardhat.org/) (v2.22.8 or later)

## WARNING ! Read that before executing anything !

- In this project, i used the latest fhevm hardhat template. Please note that i need to modify the scripts in order to make it works. In the task `taskDeploy`, i get error that ethers cannot find the contract in this location : `await ethers.getContractFactory("fhevm/...");`. I modify it to `await ethers.getContractFactory("fhevmTemp/...");` in order to be able to use the mock mode. 
- And for real test mode, i need to modify it to `await ethers.getContractFactory("fhevmTemp/fhevm/...");`
- Total supply is set to a cypher because in mint function we need to verify the eligibility of the transfer. So it needs to be a cypher because other values are. I know that maintaining a list of investors make the token not scalable as there will be more and more investors and the `allowEachInvestorToAccessTotalSupply` will be more and more expensive. It can even make the transaction failed because of the max amount of gas in a block. This is a problem that need to be considered, however we have the function `removeInvestor` to remove useless investors from the list and for a security token as the T-REX one. We will not have that many investors. So normally it should be ok. 

## Mock mode

### 1. Clone the Repository

```bash
git clone https://github.com/QiteBlock/fhevm-hardhat-t-rex.git
cd fhevm-hardhat-t-rex
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

Rename `.env.example` to `.env.`

### 4. Run tests

```bash
pnpm test:mock
```

![Tests](./screenshots/tests_passed.png)

### 5. Run coverage

```bash
pnpm coverage:mock
```

![Token Coverage](./screenshots/token_coverage.png)
![Compliance Coverage](./screenshots/compliance_coverage.png)
![Registry Coverage](./screenshots/registry_coverage.png)

## Real mode

### 1. Clone the Repository

```bash
git clone https://github.com/QiteBlock/fhevm-hardhat-t-rex.git
cd fhevm-hardhat-t-rex
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

Rename `.env.example` to `.env.`

### 4. Start Fhevm

```bash
pnpm fhevm:start
```

### 5. Deploy the first token to swap

```bash
pnpm task:deployTREX --token-name TREXA --token-symbol TREXA  
```

### 6. Deploy the second token to swap

```bash
pnpm task:deployTREX --token-name TREXB --token-symbol TREXB 
```

### 7. Deploy the Dvd transfer manager

```bash
pnpm task:deployDVD
```

### 8. Update the .env file with addresses of the deployed contracts

```bash
export TOKEN_TREX_A=TO_BE_DEFINED
export TOKEN_TREX_B=TO_BE_DEFINED
export DVD_MANAGER=TO_BE_DEFINED
```

### 9. Execute the DVD (Delivery vs Delivery)

```bash
pnpm script:executeDVD
```

![Dvd result](./screenshots/dvd_result.png)


### 7. License

This project is licensed under the GPL-3.0 License. See the LICENSE file for details.