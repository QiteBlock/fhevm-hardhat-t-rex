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

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../IModularCompliance.sol";
import "../../../token/IToken.sol";
import "./AbstractModuleUpgradeable.sol";
import "fhevm/lib/TFHE.sol";

contract MaxBalanceModule is AbstractModuleUpgradeable {
    /// state variables

    /// mapping of preset status of compliance addresses
    mapping(address => bool) private _compliancePresetStatus;

    /// maximum balance per investor ONCHAINID per modular compliance
    mapping(address => euint64) private _maxBalance;

    /// mapping of balances per ONCHAINID per modular compliance
    // solhint-disable-next-line var-name-mixedcase
    mapping(address => mapping(address => euint64)) private _IDBalance;

    /// events

    /**
     *  this event is emitted when the max balance has been set for a compliance bound.
     *  `_compliance` is the address of modular compliance concerned
     */
    event MaxBalanceSet(address indexed _compliance);

    event IDBalancePreSet(address indexed _compliance, address indexed _id);

    /// errors
    error InvalidPresetValues(address _compliance, address[] _id);

    error OnlyComplianceOwnerCanCall(address _compliance);

    error TokenAlreadyBound(address _compliance);

    /// functions

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  Sets the `_encryptedAmount` as the new max amount of tokens encrypted owned by an individual
     */
    function setMaxBalance(einput _encryptedAmount, bytes calldata _inputProof) external {
        setMaxBalance(TFHE.asEuint64(_encryptedAmount, _inputProof));
    }

    /**
     *  @dev sets max balance limit for a bound compliance contract
     *  @param _max max amount of tokens encrypted owned by an individual
     *  Only the owner of the Compliance smart contract can call this function
     *  emits an `MaxBalanceSet` event
     */
    function setMaxBalance(euint64 _max) public onlyComplianceCall {
        require(TFHE.isSenderAllowed(_max), "The sender need to be allowed to access _max cypher");
        _maxBalance[msg.sender] = _max;
        TFHE.allow(_maxBalance[msg.sender], address(this));
        TFHE.allow(_maxBalance[msg.sender], msg.sender);
        emit MaxBalanceSet(msg.sender);
    }

    /**
     *  @dev get max balance limit for a bound compliance contract
     *  @param _compliance address of the compliance manager
     */
    function getMaxBalance(address _compliance) external view returns (euint64) {
        return _maxBalance[_compliance];
    }

    /**
     *  Sets the `_encryptedAmount` as the balance of the token holder
     */
    function preSetModuleState(
        address _compliance,
        address _id,
        einput _encryptedAmount,
        bytes calldata _inputProof
    ) public {
        preSetModuleState(_compliance, _id, TFHE.asEuint64(_encryptedAmount, _inputProof));
    }

    /**
     *  @dev pre-set the balance of a token holder per ONCHAINID
     *  @param _compliance the address of the compliance contract to preset
     *  @param _id the ONCHAINID address of the token holder
     *  @param _balance the current balance of the token holder
     *  Only the owner of the Compliance smart contract can call this function
     *  emits a `IDBalancePreSet` event
     */
    function preSetModuleState(address _compliance, address _id, euint64 _balance) public {
        if (OwnableUpgradeable(_compliance).owner() != msg.sender) {
            revert OnlyComplianceOwnerCanCall(_compliance);
        }

        if (IModularCompliance(_compliance).isModuleBound(address(this))) {
            revert TokenAlreadyBound(_compliance);
        }

        _preSetModuleState(_compliance, _id, _balance);
    }

    /**
     *  Sets the `_encryptedAmount` as the balance of the token holder
     */
    function batchPreSetModuleState(
        address _compliance,
        address[] calldata _id,
        einput[] calldata _encryptedAmount,
        bytes[] calldata _inputProof
    ) public {
        if (_id.length == 0 || _id.length != _encryptedAmount.length) {
            revert InvalidPresetValues(_compliance, _id);
        }

        if (OwnableUpgradeable(_compliance).owner() != msg.sender) {
            revert OnlyComplianceOwnerCanCall(_compliance);
        }

        if (IModularCompliance(_compliance).isModuleBound(address(this))) {
            revert TokenAlreadyBound(_compliance);
        }

        for (uint i = 0; i < _id.length; i++) {
            _preSetModuleState(_compliance, _id[i], TFHE.asEuint64(_encryptedAmount[i], _inputProof[i]));
        }

        _compliancePresetStatus[_compliance] = true;
    }

    /**
     *  @dev make a batch transaction calling preSetModuleState multiple times
     *  @param _compliance the address of the compliance contract to preset
     *  @param _id the ONCHAINID address of the token holder
     *  @param _balance the current balance of the token holder encrypted
     *  Only the owner of the Compliance smart contract can call this function
     *  emits _id.length `IDBalancePreSet` events
     */
    function batchPreSetModuleState(address _compliance, address[] calldata _id, euint64[] calldata _balance) external {
        if (_id.length == 0 || _id.length != _balance.length) {
            revert InvalidPresetValues(_compliance, _id);
        }

        if (OwnableUpgradeable(_compliance).owner() != msg.sender) {
            revert OnlyComplianceOwnerCanCall(_compliance);
        }

        if (IModularCompliance(_compliance).isModuleBound(address(this))) {
            revert TokenAlreadyBound(_compliance);
        }

        for (uint i = 0; i < _id.length; i++) {
            _preSetModuleState(_compliance, _id[i], _balance[i]);
        }

        _compliancePresetStatus[_compliance] = true;
    }

    /**
     *  @dev updates compliance preset status as true
     *  @param _compliance the address of the compliance contract
     *  Only the owner of the Compliance smart contract can call this function
     */
    function presetCompleted(address _compliance) external {
        if (OwnableUpgradeable(_compliance).owner() != msg.sender) {
            revert OnlyComplianceOwnerCanCall(_compliance);
        }

        _compliancePresetStatus[_compliance] = true;
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     *  no transfer action required in this module
     */
    function moduleTransferAction(
        address _from,
        address _to,
        euint64 _value
    ) external override onlyComplianceCall returns (ebool) {
        require(TFHE.isSenderAllowed(_value), "The sender need to be allowed to access _value cypher");
        address _idFrom = _getIdentity(msg.sender, _from);
        address _idTo = _getIdentity(msg.sender, _to);
        // If the current balance plus the value to transfer is exceeding the max balance defined then it should not transfer
        ebool isModuleTransfer = TFHE.le(TFHE.add(_IDBalance[msg.sender][_idTo], _value), _maxBalance[msg.sender]);
        TFHE.allowTransient(isModuleTransfer, msg.sender);
        // We set the value to save to 0 if it should not transfer and the value if it transfers
        euint64 valueToSave = TFHE.select(isModuleTransfer, _value, TFHE.asEuint64(0));
        _IDBalance[msg.sender][_idTo] = TFHE.add(_IDBalance[msg.sender][_idTo], valueToSave);
        _IDBalance[msg.sender][_idFrom] = TFHE.sub(_IDBalance[msg.sender][_idFrom], valueToSave);
        // Allow current contract to access those new cyphers
        TFHE.allow(_IDBalance[msg.sender][_idTo], address(this));
        TFHE.allow(_IDBalance[msg.sender][_idFrom], address(this));
        return isModuleTransfer;
    }

    /**
     *  @dev See {IModule-moduleMintAction}.
     *  no mint action required in this module
     */
    function moduleMintAction(address _to, euint64 _value) external override onlyComplianceCall returns (ebool) {
        require(TFHE.isSenderAllowed(_value), "The sender need to be allowed to access _value cypher");
        address _idTo = _getIdentity(msg.sender, _to);
        ebool isModuleMint = TFHE.le(TFHE.add(_IDBalance[msg.sender][_idTo], _value), _maxBalance[msg.sender]);
        TFHE.allowTransient(isModuleMint, msg.sender);
        euint64 valueToSave = TFHE.select(isModuleMint, _value, TFHE.asEuint64(0));
        _IDBalance[msg.sender][_idTo] = TFHE.add(_IDBalance[msg.sender][_idTo], valueToSave);
        TFHE.allow(_IDBalance[msg.sender][_idTo], address(this));
        return isModuleMint;
    }

    /**
     *  @dev See {IModule-moduleBurnAction}.
     *  no burn action required in this module
     */
    function moduleBurnAction(address _from, euint64 _value) external override onlyComplianceCall {
        require(TFHE.isSenderAllowed(_value), "The sender need to be allowed to access _value cypher");
        address _idFrom = _getIdentity(msg.sender, _from);
        euint64 valueSubbed = TFHE.sub(_IDBalance[msg.sender][_idFrom], _value);
        ebool isModulesub = TFHE.lt(valueSubbed, TFHE.asEuint64(0));
        _IDBalance[msg.sender][_idFrom] = TFHE.select(isModulesub, _IDBalance[msg.sender][_idFrom], valueSubbed);
        TFHE.allow(_IDBalance[msg.sender][_idFrom], address(this));
    }

    /**
     *  @dev See {IModule-moduleCheck}.
     *  checks if the country of address _to is allowed for this _compliance
     *  returns TRUE if the country of _to is allowed for this _compliance
     *  returns FALSE if the country of _to is not allowed for this _compliance
     */
    function moduleCheck(
        address /*_from*/,
        address _to,
        euint64 _value,
        address _compliance
    ) external override returns (ebool) {
        require(TFHE.isSenderAllowed(_value), "The caller is not authorized to access this _value.");
        euint64 maxCompliance = _maxBalance[_compliance];
        ebool checkMaxBalance = TFHE.le(_value, maxCompliance);
        address _id = _getIdentity(_compliance, _to);
        // If the current balance plus the value to transfer is exceeding the max balance defined then it should not transfer
        ebool checkIdBalance = TFHE.le(TFHE.add(_IDBalance[_compliance][_id], _value), maxCompliance);
        ebool isModuleCheck = TFHE.and(checkIdBalance, checkMaxBalance);
        TFHE.allowTransient(isModuleCheck, msg.sender);
        return isModuleCheck;
    }

    /**
     *  @dev getter for compliance identity balance
     *  @param _compliance address of the compliance contract
     *  @param _identity ONCHAINID address
     */
    function getIDBalance(address _compliance, address _identity) external view returns (euint64) {
        return _IDBalance[_compliance][_identity];
    }

    /**
     *  @dev See {IModule-canComplianceBind}.
     */
    function canComplianceBind(address _compliance) external view returns (bool) {
        if (_compliancePresetStatus[_compliance]) {
            return true;
        }
        return false;
    }

    /**
     *  @dev See {IModule-isPlugAndPlay}.
     */
    function isPlugAndPlay() external pure returns (bool) {
        return false;
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "MaxBalanceModule";
    }

    /**
     *  @dev pre-set the balance of a token holder per ONCHAINID
     *  @param _compliance the address of the compliance contract to preset
     *  @param _id the ONCHAINID address of the token holder
     *  @param _balance the current balance of the token holder encrypted
     *  emits a `IDBalancePreSet` event
     */
    function _preSetModuleState(address _compliance, address _id, euint64 _balance) internal {
        require(TFHE.isSenderAllowed(_balance), "The sender need to be allowed to access _balance cypher");
        _IDBalance[_compliance][_id] = _balance;
        TFHE.allow(_IDBalance[_compliance][_id], address(this));
        emit IDBalancePreSet(_compliance, _id);
    }

    /**
     *  @dev function used to get the country of a wallet address.
     *  @param _compliance the compliance contract address for which the country verification is required
     *  @param _userAddress the address of the wallet to be checked
     *  Returns the ONCHAINID address of the wallet owner
     *  internal function, used only by the contract itself to process checks on investor countries
     */
    function _getIdentity(address _compliance, address _userAddress) internal view returns (address) {
        address identity = address(
            IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().identity(_userAddress)
        );
        require(identity != address(0), "identity not found");
        return identity;
    }
}
