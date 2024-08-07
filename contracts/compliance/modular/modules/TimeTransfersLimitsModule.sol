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

import "../IModularCompliance.sol";
import "../../../token/IToken.sol";
import "../../../roles/AgentRole.sol";
import "./AbstractModuleUpgradeable.sol";
import "fhevm/lib/TFHE.sol";

contract TimeTransfersLimitsModule is AbstractModuleUpgradeable {
    /// Struct of transfer Counters
    struct TransferCounter {
        euint64 value;
        uint256 timer;
    }

    struct Limit {
        uint32 limitTime;
        euint64 limitValue;
    }

    struct IndexLimit {
        bool attributedLimit;
        uint8 limitIndex;
    }

    // Mapping for limit time indexes
    mapping(address => mapping(uint32 => IndexLimit)) public limitValues;

    /// Mapping for limit time frames
    mapping(address => Limit[]) public transferLimits;

    /// Mapping for users Counters
    mapping(address => mapping(address => mapping(uint32 => TransferCounter))) public usersCounters;

    /**
     *  this event is emitted whenever a transfer limit is updated for the given compliance address and limit time
     *  the event is emitted by 'setTimeTransferLimit'.
     *  compliance`is the compliance contract address
     *  _limitTime is the period of time of the limit
     */
    event TimeTransferLimitUpdated(address indexed compliance, uint32 limitTime);

    error LimitsArraySizeExceeded(address compliance, uint256 arraySize);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  Sets the `_encryptedAmount` as the limit value
     */
    function setTimeTransferLimit(uint32 _limitTime, einput _encryptedAmount, bytes calldata _inputProof) external {
        setTimeTransferLimit(Limit(_limitTime, TFHE.asEuint64(_encryptedAmount, _inputProof)));
    }

    /**
     *  @dev Sets the limit of tokens allowed to be transferred in the given time frame.
     *  @param _limit The limit time and value
     *  Only the owner of the Compliance smart contract can call this function
     */
    function setTimeTransferLimit(Limit memory _limit) public onlyComplianceCall {
        bool limitIsAttributed = limitValues[msg.sender][_limit.limitTime].attributedLimit;
        uint8 limitCount = uint8(transferLimits[msg.sender].length);
        if (!limitIsAttributed && limitCount >= 4) {
            revert LimitsArraySizeExceeded(msg.sender, limitCount);
        }
        if (!limitIsAttributed && limitCount < 4) {
            transferLimits[msg.sender].push(_limit);
            limitValues[msg.sender][_limit.limitTime] = IndexLimit(true, limitCount);
        } else {
            transferLimits[msg.sender][limitValues[msg.sender][_limit.limitTime].limitIndex] = _limit;
        }
        TFHE.allow(_limit.limitValue, address(this));

        emit TimeTransferLimitUpdated(msg.sender, _limit.limitTime);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     */
    function moduleTransferAction(
        address _from,
        address /*_to*/,
        euint64 _value
    ) external override onlyComplianceCall returns (ebool) {
        _increaseCounters(msg.sender, _from, _value);
        ebool isModuleTransfer = TFHE.asEbool(true);
        TFHE.allowTransient(isModuleTransfer, msg.sender);
        return isModuleTransfer;
    }

    /**
     *  @dev See {IModule-moduleMintAction}.
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleMintAction(address _to, euint64 _value) external override onlyComplianceCall returns (ebool) {
        ebool isModuleMint = TFHE.asEbool(true);
        TFHE.allowTransient(isModuleMint, msg.sender);
        return isModuleMint;
    }

    /**
     *  @dev See {IModule-moduleBurnAction}.
     */
    // solhint-disable-next-line no-empty-blocks
    function moduleBurnAction(address _from, euint64 _value) external override onlyComplianceCall {}

    /**
     *  @dev See {IModule-moduleCheck}.
     */
    function moduleCheck(address _from, address /*_to*/, euint64 _value, address _compliance) external override returns (ebool) {
        require(TFHE.isSenderAllowed(_value), "The caller is not authorized to access this _value.");
        ebool isModuleCheck = TFHE.asEbool(true);
        if (_from == address(0)) {
            TFHE.allowTransient(isModuleCheck, msg.sender);
            return isModuleCheck;
        }

        if (_isTokenAgent(_compliance, _from)) {
            TFHE.allowTransient(isModuleCheck, msg.sender);
            return isModuleCheck;
        }

        address senderIdentity = _getIdentity(_compliance, _from);
        ebool checkAllTransferLimit = TFHE.asEbool(true);
        for (uint256 i = 0; i < transferLimits[_compliance].length; i++) {
            // same here
            ebool checkTransferLimit = TFHE.lt(_value, transferLimits[_compliance][i].limitValue);
            ebool checkUsersCounters = TFHE.asEbool(true);
            if (!_isUserCounterFinished(_compliance, senderIdentity, transferLimits[_compliance][i].limitTime)) {
                checkUsersCounters = TFHE.lt(
                    TFHE.add(usersCounters[_compliance][senderIdentity][transferLimits[_compliance][i].limitTime].value, _value),
                    transferLimits[_compliance][i].limitValue
                );
            }
            checkAllTransferLimit = TFHE.and(checkAllTransferLimit, TFHE.and(checkUsersCounters, checkTransferLimit));
        }
        TFHE.allowTransient(checkAllTransferLimit, msg.sender);
        return checkAllTransferLimit;
    }

    /**
     *  @dev getter for `transferLimits` variable
     *  @param _compliance the Compliance smart contract to be checked
     *  returns array of Limits
     */
    function getTimeTransferLimits(address _compliance) external view returns (Limit[] memory limits) {
        return transferLimits[_compliance];
    }

    /**
     *  @dev See {IModule-canComplianceBind}.
     */
    function canComplianceBind(address /*_compliance*/) external pure override returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-isPlugAndPlay}.
     */
    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    /**
     *  @dev See {IModule-name}.
     */
    function name() public pure returns (string memory _name) {
        return "TimeTransfersLimitsModule";
    }

    /**
     *  @dev Checks if the cooldown must be reset, then increases user's OnchainID counters,
     *  @param _compliance the Compliance smart contract address
     *  @param _userAddress user wallet address
     *  @param _value, value of transaction)to be increased
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _increaseCounters(address _compliance, address _userAddress, euint64 _value) internal {
        address identity = _getIdentity(_compliance, _userAddress);
        for (uint256 i = 0; i < transferLimits[_compliance].length; i++) {
            _resetUserCounter(_compliance, identity, transferLimits[_compliance][i].limitTime);
            usersCounters[_compliance][identity][transferLimits[_compliance][i].limitTime].value = TFHE.add(
                usersCounters[_compliance][identity][transferLimits[_compliance][i].limitTime].value,
                _value
            );
            TFHE.allow(usersCounters[_compliance][identity][transferLimits[_compliance][i].limitTime].value, address(this));
        }
    }

    /**
     *  @dev resets cooldown for the user if cooldown has reached the time limit
     *  @param _compliance the Compliance smart contract address
     *  @param _identity ONCHAINID of user wallet
     *  @param _limitTime limit time frame
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _resetUserCounter(address _compliance, address _identity, uint32 _limitTime) internal {
        if (_isUserCounterFinished(_compliance, _identity, _limitTime)) {
            TransferCounter storage counter = usersCounters[_compliance][_identity][_limitTime];
            counter.timer = block.timestamp + _limitTime;
            counter.value = TFHE.asEuint64(0);
        }
    }

    /**
     *  @dev checks if the counter time frame has finished since the cooldown has been triggered for this identity
     *  @param _compliance the Compliance smart contract to be checked
     *  @param _identity ONCHAINID of user wallet
     *  @param _limitTime limit time frame
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _isUserCounterFinished(address _compliance, address _identity, uint32 _limitTime) internal view returns (bool) {
        return usersCounters[_compliance][_identity][_limitTime].timer <= block.timestamp;
    }

    /**
     *  @dev Returns the ONCHAINID (Identity) of the _userAddress
     *  @param _userAddress Address of the wallet
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _getIdentity(address _compliance, address _userAddress) internal view returns (address) {
        return address(IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().identity(_userAddress));
    }

    /**
     *  @dev checks if the given user address is an agent of token
     *  @param compliance the Compliance smart contract to be checked
     *  @param _userAddress ONCHAIN identity of the user
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _isTokenAgent(address compliance, address _userAddress) internal view returns (bool) {
        return AgentRole(IModularCompliance(compliance).getTokenBound()).isAgent(_userAddress);
    }
}
