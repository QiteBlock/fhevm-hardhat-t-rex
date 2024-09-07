// SPDX-License-Identifier: GPL-3.0
//
//                                             :+#####%%%%%%%%%%%%%%+
//                                         .-*@@@%+.:+%@@@@@%%#***%@@%=
//                                     :=*%@@@#=.      :#@@%       *@@@%=
//                       .-+*%@%*-.:+%@@@@@@+.     -*+:  .=#.       :%@@@%-
//                   :=*@@@@%%@@@@@@@@@%@@@-   .=#@@@%@%=             =@@@@#.
//             -=+#%@@%#*=:.  :%@@@@%.   -*@@#*@@@@@@@#=:-              *@@@@+
//            =@@%=:.     :=:   *@@@@@%#-   =%*%@@@@#+-.        =+       :%@@@%-
//           -@@%.     .+@@@     =+=-.         @@#-           +@@@%-       =@@@@%:
//          :@@@.    .+@@#%:                   :    .=*=-::.-%@@@+*@@=       +@@@@#.
//          %@@:    +@%%*                         =%@@@@@@@@@@@#.  .*@%-       +@@@@*.
//         #@@=                                .+@@@@%:=*@@@@@-      :%@%:      .*@@@@+
//        *@@*                                +@@@#-@@%-:%@@*          +@@#.      :%@@@@-
//       -@@%           .:-=++*##%%%@@@@@@@@@@@@*. :@+.@@@%:            .#@@+       =@@@@#:
//      .@@@*-+*#%%%@@@@@@@@@@@@@@@@%%#**@@%@@@.   *@=*@@#                :#@%=      .#@@@@#-
//      -%@@@@@@@@@@@@@@@*+==-:-@@@=    *@# .#@*-=*@@@@%=                 -%@@@*       =@@@@@%-
//         -+%@@@#.   %@%%=   -@@:+@: -@@*    *@@*-::                   -%@@%=.         .*@@@@@#
//            *@@@*  +@* *@@##@@-  #@*@@+    -@@=          .         :+@@@#:           .-+@@@%+-
//             +@@@%*@@:..=@@@@*   .@@@*   .#@#.       .=+-       .=%@@@*.         :+#@@@@*=:
//              =@@@@%@@@@@@@@@@@@@@@@@@@@@@%-      :+#*.       :*@@@%=.       .=#@@@@%+:
//               .%@@=                 .....    .=#@@+.       .#@@@*:       -*%@@@@%+.
//                 +@@#+===---:::...         .=%@@*-         +@@@+.      -*@@@@@%+.
//                  -@@@@@@@@@@@@@@@@@@@@@@%@@@@=          -@@@+      -#@@@@@#=.
//                    ..:::---===+++***###%%%@@@#-       .#@@+     -*@@@@@#=.
//                                           @@@@@@+.   +@@*.   .+@@@@@%=.
//                                          -@@@@@=   =@@%:   -#@@@@%+.
//                                          +@@@@@. =@@@=  .+@@@@@*:
//                                          #@@@@#:%@@#. :*@@@@#-
//                                          @@@@@%@@@= :#@@@@+.
//                                         :@@@@@@@#.:#@@@%-
//                                         +@@@@@@-.*@@@*:
//                                         #@@@@#.=@@@+.
//                                         @@@@+-%@%=
//                                        :@@@#%@%=
//                                        +@@@@%-
//                                        :#%%=
//

/**
 *     NOTICE
 *
 *     The T-REX software is licensed under a proprietary license or the GPL v.3.
 *     If you choose to receive it under the GPL v.3 license, the following applies:
 *     T-REX is a suite of smart contracts implementing the ERC-3643 standard and
 *     developed by Tokeny to manage and transfer financial assets on EVM blockchains
 *
 *     Copyright (C) 2023, Tokeny sàrl.
 *
 *     This program is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

pragma solidity ^0.8.17;

import "fhevm/lib/TFHE.sol";
import "./IToken.sol";
import "onchain-id-custom/contracts/interface/IIdentity.sol";
import "./TokenStorage.sol";
import "../roles/AgentRoleUpgradeable.sol";

contract Token is IToken, AgentRoleUpgradeable, TokenStorage {
    /// modifiers

    /// @dev Modifier to make a function callable only when the contract is not paused.
    modifier whenNotPaused() {
        require(!_tokenPaused, "Pausable: paused");
        _;
    }

    /// @dev Modifier to make a function callable only when the contract is paused.
    modifier whenPaused() {
        require(_tokenPaused, "Pausable: not paused");
        _;
    }

    /**
     *  @dev the constructor initiates the token contract
     *  msg.sender is set automatically as the owner of the smart contract
     *  @param _identityRegistry the address of the Identity registry linked to the token
     *  @param _compliance the address of the compliance contract linked to the token
     *  @param _name the name of the token
     *  @param _symbol the symbol of the token
     *  @param _decimals the decimals of the token
     *  @param _onchainID the address of the onchainID of the token
     *  emits an `UpdatedTokenInformation` event
     *  emits an `IdentityRegistryAdded` event
     *  emits a `ComplianceAdded` event
     */
    function init(
        address _identityRegistry,
        address _compliance,
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        // _onchainID can be zero address if not set, can be set later by owner
        address _onchainID
    ) external initializer {
        // that require is protecting legacy versions of TokenProxy contracts
        // as there was a bug with the initializer modifier on these proxies
        // that check is preventing attackers to call the init functions on those
        // legacy contracts.
        require(owner() == address(0), "already initialized");
        require(_identityRegistry != address(0) && _compliance != address(0), "invalid argument - zero address");
        require(
            keccak256(abi.encode(_name)) != keccak256(abi.encode("")) &&
                keccak256(abi.encode(_symbol)) != keccak256(abi.encode("")),
            "invalid argument - empty string"
        );
        require(0 <= _decimals && _decimals <= 18, "decimals between 0 and 18");
        __Ownable_init();
        _tokenName = _name;
        _tokenSymbol = _symbol;
        _tokenDecimals = _decimals;
        _tokenOnchainID = _onchainID;
        _tokenPaused = true;
        setIdentityRegistry(_identityRegistry);
        setComplianceOnInit(_compliance);
        emit UpdatedTokenInformation(_tokenName, _tokenSymbol, _tokenDecimals, _TOKEN_VERSION, _tokenOnchainID);
    }

    // Sets the `_encryptedAmount` as the allowance of `_spender` over the caller's tokens.
    function approve(address _spender, einput _encryptedAmount, bytes calldata _inputProof) external returns (bool) {
        approve(_spender, TFHE.asEuint64(_encryptedAmount, _inputProof));
        return true;
    }

    /**
     *  @dev See {IERC20-approve}.
     */
    function approve(address _spender, euint64 _amount) public override returns (bool) {
        require(TFHE.isSenderAllowed(_amount));
        _approve(msg.sender, _spender, _amount);
        emit Approval(msg.sender, _spender);
        return true;
    }

    // Sets the `_encryptedAmount` as the added allowance of `_spender` over the caller's tokens.
    function increaseAllowance(address _spender, einput _encryptedAmount, bytes calldata _inputProof) external returns (bool) {
        increaseAllowance(_spender, TFHE.asEuint64(_encryptedAmount, _inputProof));
        return true;
    }

    /**
     *  @dev See {ERC20-increaseAllowance}.
     */
    function increaseAllowance(address _spender, euint64 _addedValue) public returns (bool) {
        require(TFHE.isSenderAllowed(_addedValue));
        euint64 newAllowance = TFHE.add(_allowances[msg.sender][_spender], _addedValue);
        _approve(msg.sender, _spender, newAllowance);
        return true;
    }

    // Sets the `_encryptedAmount` as the subbed allowance of `_spender` over the caller's tokens.
    function decreaseAllowance(address _spender, einput _encryptedAmount, bytes calldata _inputProof) external returns (bool) {
        decreaseAllowance(_spender, TFHE.asEuint64(_encryptedAmount, _inputProof));
        return true;
    }

    /**
     *  @dev See {ERC20-decreaseAllowance}.
     */
    function decreaseAllowance(address _spender, euint64 _subtractedValue) public returns (bool) {
        require(TFHE.isSenderAllowed(_subtractedValue));
        euint64 newAllowance = TFHE.sub(_allowances[msg.sender][_spender], _subtractedValue);
        _approve(msg.sender, _spender, newAllowance);
        return true;
    }

    /**
     *  @dev See {IToken-setName}.
     */
    function setName(string calldata _name) external override onlyOwner {
        require(keccak256(abi.encode(_name)) != keccak256(abi.encode("")), "invalid argument - empty string");
        _tokenName = _name;
        emit UpdatedTokenInformation(_tokenName, _tokenSymbol, _tokenDecimals, _TOKEN_VERSION, _tokenOnchainID);
    }

    /**
     *  @dev See {IToken-setSymbol}.
     */
    function setSymbol(string calldata _symbol) external override onlyOwner {
        require(keccak256(abi.encode(_symbol)) != keccak256(abi.encode("")), "invalid argument - empty string");
        _tokenSymbol = _symbol;
        emit UpdatedTokenInformation(_tokenName, _tokenSymbol, _tokenDecimals, _TOKEN_VERSION, _tokenOnchainID);
    }

    /**
     *  @dev See {IToken-setOnchainID}.
     *  if _onchainID is set at zero address it means no ONCHAINID is bound to this token
     */
    function setOnchainID(address _onchainID) external override onlyOwner {
        _tokenOnchainID = _onchainID;
        emit UpdatedTokenInformation(_tokenName, _tokenSymbol, _tokenDecimals, _TOKEN_VERSION, _tokenOnchainID);
    }

    /**
     *  @dev See {IToken-pause}.
     */
    function pause() external override onlyAgent whenNotPaused {
        _tokenPaused = true;
        emit Paused(msg.sender);
    }

    /**
     *  @dev See {IToken-unpause}.
     */
    function unpause() external override onlyAgent whenPaused {
        _tokenPaused = false;
        emit Unpaused(msg.sender);
    }

    function batchTransfer(address[] calldata _toList, einput[] calldata _encryptedAmount, bytes calldata _inputProof) external {
        for (uint256 i = 0; i < _toList.length; i++) {
            transfer(_toList[i], _encryptedAmount[i], _inputProof);
        }
    }

    /**
     *  @dev See {IToken-batchTransfer}.
     */
    function batchTransfer(address[] calldata _toList, euint64[] calldata _amounts) public override {
        for (uint256 i = 0; i < _toList.length; i++) {
            transfer(_toList[i], _amounts[i]);
        }
    }

    function transferFrom(
        address _from,
        address _to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) external virtual returns (bool) {
        transferFrom(_from, _to, TFHE.asEuint64(encryptedAmount, inputProof));
        return true;
    }

    /**
     *  @notice ERC-20 overridden function that include logic to check for trade validity.
     *  Require that the from and to addresses are not frozen.
     *  Require that the value should not exceed available balance .
     *  Require that the to address is a verified address
     *  @param _from The address of the sender
     *  @param _to The address of the receiver
     *  @param _amount The number of tokens to transfer
     *  @return `true` if successful and revert if unsuccessful
     */
    function transferFrom(address _from, address _to, euint64 _amount) public override whenNotPaused returns (bool) {
        require(TFHE.isSenderAllowed(_amount));
        require(!_frozen[_to] && !_frozen[_from], "wallet is frozen");
        euint64 currentAllowance = _allowances[_from][msg.sender];
        ebool isTransferable = _updateAllowance(_from, msg.sender, _amount, currentAllowance);
        euint64 transferValue = TFHE.select(isTransferable, _amount, TFHE.asEuint64(0));
        if (_tokenIdentityRegistry.isVerified(_to)) {
            TFHE.allowTransient(transferValue, address(_tokenCompliance));
            ebool canTransferModule = _tokenCompliance.canTransfer(_from, _to, transferValue);
            euint64 intermediateValue = TFHE.select(canTransferModule, transferValue, TFHE.asEuint64(0));
            TFHE.allowTransient(intermediateValue, address(_tokenCompliance));
            ebool isTransferred = _tokenCompliance.transferred(_from, _to, intermediateValue);
            euint64 finalValue = TFHE.select(isTransferred, intermediateValue, TFHE.asEuint64(0));
            _approve(
                _from,
                msg.sender,
                TFHE.select(TFHE.and(isTransferred, isTransferred), TFHE.sub(currentAllowance, _amount), currentAllowance)
            );
            _transfer(_from, _to, finalValue, TFHE.and(isTransferred, canTransferModule));
            return true;
        }
        revert("Transfer not possible");
    }

    function _updateAllowance(
        address _from,
        address /*_to*/,
        euint64 _amount,
        euint64 currentAllowance
    ) internal virtual returns (ebool) {
        // makes sure the allowance suffices
        ebool allowedTransfer = TFHE.le(_amount, currentAllowance);
        // makes sure the owner has enough tokens
        euint64 amountToCompared = TFHE.sub(balanceOf(_from), _frozenTokens[_from]);
        ebool canTransfer = TFHE.le(_amount, amountToCompared);
        return TFHE.and(canTransfer, allowedTransfer);
    }

    function batchForcedTransfer(
        address[] calldata _fromList,
        address[] calldata _toList,
        einput[] calldata _encryptedAmount,
        bytes calldata _inputProof
    ) external {
        for (uint256 i = 0; i < _toList.length; i++) {
            forcedTransfer(_fromList[i], _toList[i], _encryptedAmount[i], _inputProof);
        }
    }

    /**
     *  @dev See {IToken-batchForcedTransfer}.
     */
    function batchForcedTransfer(
        address[] calldata _fromList,
        address[] calldata _toList,
        euint64[] calldata _amounts
    ) external override {
        for (uint256 i = 0; i < _fromList.length; i++) {
            forcedTransfer(_fromList[i], _toList[i], _amounts[i]);
        }
    }

    function batchMint(address[] calldata _toList, einput[] calldata _encryptedAmount, bytes calldata _inputProof) external {
        for (uint256 i = 0; i < _toList.length; i++) {
            mint(_toList[i], _encryptedAmount[i], _inputProof);
        }
    }

    /**
     *  @dev See {IToken-batchMint}.
     */
    function batchMint(address[] calldata _toList, euint64[] calldata _amounts) external override {
        for (uint256 i = 0; i < _toList.length; i++) {
            mint(_toList[i], _amounts[i]);
        }
    }

    function batchBurn(address[] calldata _toList, einput[] calldata _encryptedAmount, bytes calldata _inputProof) external {
        for (uint256 i = 0; i < _toList.length; i++) {
            burn(_toList[i], _encryptedAmount[i], _inputProof);
        }
    }

    /**
     *  @dev See {IToken-batchBurn}.
     */
    function batchBurn(address[] calldata _userAddresses, euint64[] calldata _amounts) external override {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            burn(_userAddresses[i], _amounts[i]);
        }
    }

    /**
     *  @dev See {IToken-batchSetAddressFrozen}.
     */
    function batchSetAddressFrozen(address[] calldata _userAddresses, bool[] calldata _freeze) external override {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            setAddressFrozen(_userAddresses[i], _freeze[i]);
        }
    }

    function batchFreezePartialTokens(
        address[] calldata _userAddresses,
        einput[] calldata _encryptedAmount,
        bytes calldata _inputProof
    ) external {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            freezePartialTokens(_userAddresses[i], _encryptedAmount[i], _inputProof);
        }
    }

    /**
     *  @dev See {IToken-batchFreezePartialTokens}.
     */
    function batchFreezePartialTokens(address[] calldata _userAddresses, euint64[] calldata _amounts) external override {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            freezePartialTokens(_userAddresses[i], _amounts[i]);
        }
    }

    function batchUnfreezePartialTokens(
        address[] calldata _userAddresses,
        einput[] calldata _encryptedAmount,
        bytes calldata _inputProof
    ) external {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            unfreezePartialTokens(_userAddresses[i], _encryptedAmount[i], _inputProof);
        }
    }

    /**
     *  @dev See {IToken-batchUnfreezePartialTokens}.
     */
    function batchUnfreezePartialTokens(address[] calldata _userAddresses, euint64[] calldata _amounts) external override {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            unfreezePartialTokens(_userAddresses[i], _amounts[i]);
        }
    }

    /**
     *  @dev See {IToken-recoveryAddress}.
     */
    function recoveryAddress(
        address _lostWallet,
        address _newWallet,
        address _investorOnchainID
    ) external override onlyAgent returns (bool) {
        ebool isBalanceEmpty = TFHE.eq(balanceOf(_lostWallet), TFHE.asEuint64(0));
        IIdentity _onchainID = IIdentity(_investorOnchainID);
        bytes32 _key = keccak256(abi.encode(_newWallet));
        if (_onchainID.keyHasPurpose(_key, 1)) {
            euint64 finalInvestorTokens = TFHE.select(isBalanceEmpty, TFHE.asEuint64(0), balanceOf(_lostWallet));
            euint64 finalFrozenTokens = TFHE.select(isBalanceEmpty, TFHE.asEuint64(0), _frozenTokens[_lostWallet]);
            _tokenIdentityRegistry.registerIdentity(_newWallet, _onchainID, _tokenIdentityRegistry.investorCountry(_lostWallet));
            TFHE.allowTransient(finalInvestorTokens, address(this));
            forcedTransfer(_lostWallet, _newWallet, finalInvestorTokens);
            TFHE.allowTransient(finalFrozenTokens, address(this));
            freezePartialTokens(_newWallet, finalFrozenTokens);
            if (_frozen[_lostWallet] == true) {
                setAddressFrozen(_newWallet, true);
            }
            _tokenIdentityRegistry.deleteIdentity(_lostWallet);
            emit RecoverySuccess(_lostWallet, _newWallet, _investorOnchainID);
            return true;
        }
        revert("Recovery not possible");
    }

    /**
     *  @dev See {IERC20-totalSupply}.
     */
    function totalSupply() external view override returns (euint64) {
        return _totalSupply;
    }

    /**
     *  @dev See {IERC20-allowance}.
     */
    function allowance(address _owner, address _spender) public view virtual override returns (euint64) {
        return _allowances[_owner][_spender];
    }

    /**
     *  @dev See {IToken-identityRegistry}.
     */
    function identityRegistry() external view override returns (IIdentityRegistry) {
        return _tokenIdentityRegistry;
    }

    /**
     *  @dev See {IToken-compliance}.
     */
    function compliance() external view override returns (IModularCompliance) {
        return _tokenCompliance;
    }

    /**
     *  @dev See {IToken-paused}.
     */
    function paused() external view override returns (bool) {
        return _tokenPaused;
    }

    /**
     *  @dev See {IToken-isFrozen}.
     */
    function isFrozen(address _userAddress) external view override returns (bool) {
        return _frozen[_userAddress];
    }

    /**
     *  @dev See {IToken-getFrozenTokens}.
     */
    function getFrozenTokens(address _userAddress) public view override returns (euint64) {
        return _frozenTokens[_userAddress];
    }

    /**
     *  @dev See {IToken-decimals}.
     */
    function decimals() external view override returns (uint8) {
        return _tokenDecimals;
    }

    /**
     *  @dev See {IToken-name}.
     */
    function name() external view override returns (string memory) {
        return _tokenName;
    }

    /**
     *  @dev See {IToken-onchainID}.
     */
    function onchainID() external view override returns (address) {
        return _tokenOnchainID;
    }

    /**
     *  @dev See {IToken-symbol}.
     */
    function symbol() external view override returns (string memory) {
        return _tokenSymbol;
    }

    /**
     *  @dev See {IToken-version}.
     */
    function version() external pure override returns (string memory) {
        return _TOKEN_VERSION;
    }

    function transfer(address to, einput encryptedAmount, bytes calldata inputProof) public virtual returns (bool) {
        transfer(to, TFHE.asEuint64(encryptedAmount, inputProof));
        return true;
    }

    /**
     *  @notice ERC-20 overridden function that include logic to check for trade validity.
     *  Require that the msg.sender and to addresses are not frozen.
     *  Require that the value should not exceed available balance .
     *  Require that the to address is a verified address
     *  @param _to The address of the receiver
     *  @param _amount The number of tokens to transfer
     *  @return `true` if successful and revert if unsuccessful
     */
    function transfer(address _to, euint64 _amount) public whenNotPaused returns (bool) {
        require(TFHE.isSenderAllowed(_amount));
        require(!_frozen[_to] && !_frozen[msg.sender], "wallet is frozen");
        euint64 amountToCompared = TFHE.sub(balanceOf(msg.sender), _frozenTokens[msg.sender]);
        ebool insufficientBalance = TFHE.le(_amount, amountToCompared);
        // Some tokens are frozen, so the amountToCompared can be greater than _amount
        euint64 transferValue = TFHE.select(insufficientBalance, _amount, TFHE.asEuint64(0));
        if (_tokenIdentityRegistry.isVerified(_to)) {
            TFHE.allowTransient(transferValue, address(_tokenCompliance));
            ebool canTransfer = _tokenCompliance.canTransfer(msg.sender, _to, transferValue);
            euint64 intermediateValue = TFHE.select(canTransfer, transferValue, TFHE.asEuint64(0));
            TFHE.allowTransient(intermediateValue, address(_tokenCompliance));
            ebool isTransferred = _tokenCompliance.transferred(msg.sender, _to, intermediateValue);
            euint64 finalValue = TFHE.select(isTransferred, intermediateValue, TFHE.asEuint64(0));
            _transfer(msg.sender, _to, finalValue, TFHE.and(isTransferred, canTransfer));
            return true;
        }
        revert("Transfer not possible");
    }

    function forcedTransfer(
        address _from,
        address _to,
        einput encryptedAmount,
        bytes calldata inputProof
    ) public virtual returns (bool) {
        forcedTransfer(_from, _to, TFHE.asEuint64(encryptedAmount, inputProof));
        return true;
    }

    /**
     *  @dev See {IToken-forcedTransfer}.
     */
    function forcedTransfer(address _from, address _to, euint64 _amount) public override onlyAgent returns (bool) {
        euint64 transferValue = TFHE.select(TFHE.lt(balanceOf(_from), _amount), TFHE.asEuint64(0), _amount);
        euint64 freeBalance = TFHE.sub(balanceOf(_from), _frozenTokens[_from]);
        // If transferValue is greater than freeBalance then it's normal, we can put transferValue
        // but if it's not then the value is freeBalance
        euint64 amountToSub = TFHE.select(TFHE.gt(transferValue, freeBalance), transferValue, freeBalance);
        // In this case, if transferValue is greater than freeBalance then
        // tokensToUnfreeze = transferValue - freeBalance else we have
        // tokensToUnfreeze = freeBalance - freeBalance = 0
        euint64 tokensToUnfreeze = TFHE.sub(amountToSub, freeBalance);
        _frozenTokens[_from] = TFHE.sub(_frozenTokens[_from], tokensToUnfreeze);
        TFHE.allow(_frozenTokens[_from], msg.sender);
        TFHE.allow(_frozenTokens[_from], address(this));
        TFHE.allow(_frozenTokens[_from], _from);
        // Useless as it will be trigger everytime
        // emit TokensUnfrozen(_from, tokensToUnfreeze);
        if (_tokenIdentityRegistry.isVerified(_to)) {
            TFHE.allowTransient(transferValue, address(_tokenCompliance));
            ebool isTransferred = _tokenCompliance.transferred(_from, _to, transferValue);
            euint64 finalValue = TFHE.select(isTransferred, transferValue, TFHE.asEuint64(0));
            _transfer(_from, _to, finalValue, TFHE.asEbool(true));
        }
        return true;
    }

    function mint(address _userAddress, einput encryptedAmount, bytes calldata inputProof) public virtual returns (bool) {
        mint(_userAddress, TFHE.asEuint64(encryptedAmount, inputProof));
        return true;
    }

    /**
     *  @dev See {IToken-mint}.
     */
    function mint(address _to, euint64 _amount) public override onlyAgent {
        require(_tokenIdentityRegistry.isVerified(_to), "Identity is not verified.");
        // Allow compliance module to access _amount
        TFHE.allowTransient(_amount, address(_tokenCompliance));
        ebool canTransfer = _tokenCompliance.canTransfer(address(0), _to, _amount);
        euint64 amountToTransfer = TFHE.select(canTransfer, _amount, TFHE.asEuint64(0));
        // Allow compliance module to access amountToTransfer
        TFHE.allowTransient(amountToTransfer, address(_tokenCompliance));
        ebool isCreated = _tokenCompliance.created(_to, amountToTransfer);
        euint64 finalAmount = TFHE.select(isCreated, amountToTransfer, TFHE.asEuint64(0));
        _mint(_to, finalAmount);
    }

    function burn(address _userAddress, einput encryptedAmount, bytes calldata inputProof) public virtual returns (bool) {
        burn(_userAddress, TFHE.asEuint64(encryptedAmount, inputProof));
        return true;
    }

    /**
     *  @dev See {IToken-burn}.
     */
    function burn(address _userAddress, euint64 _amount) public override onlyAgent {
        ebool checkIfBalanceExceed = TFHE.lt(balanceOf(_userAddress), _amount);
        euint64 amountToBurn = TFHE.select(checkIfBalanceExceed, TFHE.asEuint64(0), _amount);
        euint64 freeBalance = TFHE.sub(balanceOf(_userAddress), _frozenTokens[_userAddress]);
        ebool isAmountMoreThanFreeBalance = TFHE.gt(amountToBurn, freeBalance);
        euint64 amountToSub = TFHE.select(isAmountMoreThanFreeBalance, amountToBurn, freeBalance);
        euint64 tokensToUnfreeze = TFHE.sub(amountToSub, freeBalance);
        _frozenTokens[_userAddress] = TFHE.sub(_frozenTokens[_userAddress], tokensToUnfreeze);
        TFHE.allow(_frozenTokens[_userAddress], msg.sender);
        TFHE.allow(_frozenTokens[_userAddress], address(this));
        TFHE.allow(_frozenTokens[_userAddress], _userAddress);
        emit TokensUnfrozen(_userAddress);
        _burn(_userAddress, amountToBurn);
        TFHE.allowTransient(amountToBurn, address(_tokenCompliance));
        _tokenCompliance.destroyed(_userAddress, amountToBurn);
    }

    /**
     *  @dev See {IToken-setAddressFrozen}.
     */
    function setAddressFrozen(address _userAddress, bool _freeze) public override onlyAgent {
        _frozen[_userAddress] = _freeze;

        emit AddressFrozen(_userAddress, _freeze, msg.sender);
    }

    function freezePartialTokens(address _userAddress, einput encryptedAmount, bytes calldata inputProof) public {
        freezePartialTokens(_userAddress, TFHE.asEuint64(encryptedAmount, inputProof));
    }

    /**
     *  @dev See {IToken-freezePartialTokens}.
     */
    function freezePartialTokens(address _userAddress, euint64 _amount) public override onlyAgent {
        euint64 balance = balanceOf(_userAddress);
        ebool isAmountExceeded = TFHE.lt(balance, TFHE.add(_frozenTokens[_userAddress], _amount));
        euint64 amountToFreeze = TFHE.select(isAmountExceeded, TFHE.asEuint64(0), _amount);
        euint64 newFrozenToken = TFHE.add(_frozenTokens[_userAddress], amountToFreeze);
        _frozenTokens[_userAddress] = newFrozenToken;
        TFHE.allow(_frozenTokens[_userAddress], msg.sender);
        TFHE.allow(_frozenTokens[_userAddress], address(this));
        TFHE.allow(_frozenTokens[_userAddress], _userAddress);
        emit TokensFrozen(_userAddress);
    }

    function unfreezePartialTokens(address _userAddress, einput encryptedAmount, bytes calldata inputProof) public {
        unfreezePartialTokens(_userAddress, TFHE.asEuint64(encryptedAmount, inputProof));
    }

    /**
     *  @dev See {IToken-unfreezePartialTokens}.
     */
    function unfreezePartialTokens(address _userAddress, euint64 _amount) public override onlyAgent {
        ebool isAmountExceeded = TFHE.lt(_frozenTokens[_userAddress], _amount);
        euint64 amountToUnfreeze = TFHE.select(isAmountExceeded, TFHE.asEuint64(0), _amount);
        euint64 newFrozenToken = TFHE.sub(_frozenTokens[_userAddress], amountToUnfreeze);
        _frozenTokens[_userAddress] = newFrozenToken;
        TFHE.allow(_frozenTokens[_userAddress], msg.sender);
        TFHE.allow(_frozenTokens[_userAddress], address(this));
        TFHE.allow(_frozenTokens[_userAddress], _userAddress);
        emit TokensUnfrozen(_userAddress);
    }

    /**
     *  @dev See {IToken-setIdentityRegistry}.
     */
    function setIdentityRegistry(address _identityRegistry) public override onlyOwner {
        _tokenIdentityRegistry = IIdentityRegistry(_identityRegistry);
        emit IdentityRegistryAdded(_identityRegistry);
    }

    /**
     *  @dev See {IToken-setCompliance}.
     */
    function setComplianceOnInit(address _compliance) public onlyOwner {
        if (address(_tokenCompliance) != address(0)) {
            _tokenCompliance.unbindToken(address(this));
        }
        _tokenCompliance = IModularCompliance(_compliance);
        _tokenCompliance.bindToken(address(this));
        emit ComplianceAdded(_compliance);
    }

    function setCompliance(address _compliance) public override onlyOwner {
        if (address(_tokenCompliance) != address(0)) {
            _tokenCompliance.unbindToken(address(this));
        }
        _tokenCompliance = IModularCompliance(_compliance);
        _tokenCompliance.bindToken(address(this));
        TFHE.allow(_totalSupply, address(_tokenCompliance));
        address[] memory _moduleAddresses = _tokenCompliance.getModules();
        uint256 length = _moduleAddresses.length;
        for (uint256 i = 0; i < length; i++) {
            TFHE.allow(_totalSupply, _moduleAddresses[i]);
        }
        emit ComplianceAdded(_compliance);
    }

    /**
     *  @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address _userAddress) public view override returns (euint64) {
        return _balances[_userAddress];
    }

    /**
     *  @dev See {ERC20-_transfer}.
     */
    function _transfer(address _from, address _to, euint64 _amount, ebool canTransfer) internal virtual {
        require(_from != address(0), "ERC20: transfer from the zero address");
        require(_to != address(0), "ERC20: transfer to the zero address");
        _beforeTokenTransfer(_from, _to, _amount);
        euint64 transferValue = TFHE.select(canTransfer, _amount, TFHE.asEuint64(0));
        euint64 newBalanceTo = TFHE.add(_balances[_to], transferValue);
        _balances[_to] = newBalanceTo;
        TFHE.allow(_balances[_to], address(this));
        TFHE.allow(_balances[_to], _to);
        euint64 newBalanceFrom = TFHE.sub(_balances[_from], transferValue);
        _balances[_from] = newBalanceFrom;
        TFHE.allow(_balances[_from], address(this));
        // Allow new address to access totalSupply. Please note that we know that there are a leak,
        // when we give the permission to someone to read the value we never take it back even if in the
        // future he don't have any tokens
        allowEachInvestorToAccessTotalSupply();
        emit Transfer(_from, _to);
    }

    /**
     *  @dev See {ERC20-_mint}.
     */
    function _mint(address _userAddress, euint64 _amount) internal virtual {
        require(_userAddress != address(0), "ERC20: mint to the zero address");
        _beforeTokenTransfer(address(0), _userAddress, _amount);
        _balances[_userAddress] = TFHE.add(_balances[_userAddress], _amount);
        TFHE.allow(_balances[_userAddress], address(this));
        TFHE.allow(_balances[_userAddress], _userAddress);
        _totalSupply = TFHE.add(_totalSupply, _amount);
        TFHE.allow(_totalSupply, address(this));
        allowEachInvestorToAccessTotalSupply();
        TFHE.allow(_totalSupply, address(_tokenCompliance));
        // Allow each token compliance module to access the total supply cypher (Especially for SupplyLimitModule)
        address[] memory _moduleAddresses = _tokenCompliance.getModules();
        for (uint256 i = 0; i < _moduleAddresses.length; i++) {
            TFHE.allow(_totalSupply, _moduleAddresses[i]);
        }
        emit Transfer(address(0), _userAddress);
    }

    /**
     *  @dev See {ERC20-_burn}.
     */
    function _burn(address _userAddress, euint64 _amount) internal virtual {
        require(_userAddress != address(0), "ERC20: burn from the zero address");
        _beforeTokenTransfer(_userAddress, address(0), _amount);
        euint64 newBalance = TFHE.sub(_balances[_userAddress], _amount);
        _balances[_userAddress] = newBalance;
        TFHE.allow(_balances[_userAddress], address(this));
        TFHE.allow(_balances[_userAddress], _userAddress);
        _totalSupply = TFHE.sub(_totalSupply, _amount);
        TFHE.allow(_totalSupply, address(this));
        allowEachInvestorToAccessTotalSupply();
        TFHE.allow(_totalSupply, address(_tokenCompliance));
        address[] memory _moduleAddresses = _tokenCompliance.getModules();
        // Allow each token compliance module to access the total supply cypher (Especially for SupplyLimitModule)
        for (uint256 i = 0; i < _moduleAddresses.length; i++) {
            TFHE.allow(_totalSupply, _moduleAddresses[i]);
        }
        emit Transfer(_userAddress, address(0));
    }

    /**
     *  @dev See {ERC20-_approve}.
     */
    function _approve(address _owner, address _spender, euint64 _amount) internal virtual {
        require(_owner != address(0), "ERC20: approve from the zero address");
        require(_spender != address(0), "ERC20: approve to the zero address");
        _allowances[_owner][_spender] = _amount;
        TFHE.allow(_allowances[_owner][_spender], address(this));
        TFHE.allow(_allowances[_owner][_spender], _owner);
        TFHE.allow(_allowances[_owner][_spender], _spender);
    }

    /**
     *  @dev See {ERC20-_beforeTokenTransfer}.
     */
    // solhint-disable-next-line no-empty-blocks
    function _beforeTokenTransfer(address _from, address _to, euint64 /*_amount*/) internal virtual {
        if (!investors[_to]) {
            investors[_to] = true;
            investorList.push(_to);
        }
        if (investors[_from]) {
            investors[_from] = false;
        }
    }

    // Public function to get the investor list
    function getInvestors() external view onlyAgent returns (address[] memory) {
        return investorList;
    }

    function allowEachInvestorToAccessTotalSupply() internal {
        for (uint256 i = 0; i < investorList.length; i++) {
            TFHE.allow(_totalSupply, investorList[i]);
        }
    }

    // Function to remove an investor from the array
    function removeInvestor(address investor) external onlyAgent {
        for (uint256 i = 0; i < investorList.length; i++) {
            if (investorList[i] == investor) {
                investors[investor] = false;
                investorList[i] = investorList[investorList.length - 1];
                investorList.pop();
                break;
            }
        }
    }
}
