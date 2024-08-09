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

contract TransferFeesModule is AbstractModuleUpgradeable {
    /// Struct of fees
    struct Fee {
        uint256 rate; // min = 0, max = 10000, 0.01% = 1, 1% = 100, 100% = 10000
        address collector;
    }

    /// Mapping for compliance fees
    mapping(address => Fee) private _fees;

    /**
     *  this event is emitted whenever a fee definition is updated for the given compliance address
     *  the event is emitted by 'setFee'.
     *  compliance is the compliance contract address
     *  _rate is the rate of the fee (0.01% = 1, 1% = 100, 100% = 10000)
     *  _collector is the collector wallet address
     */
    event FeeUpdated(address indexed compliance, uint256 _rate, address _collector);

    error FeeRateIsOutOfRange(address compliance, uint256 rate);

    error CollectorAddressIsNotVerified(address compliance, address collector);

    /**
     * @dev initializes the contract and sets the initial state.
     * @notice This function should only be called once during the contract deployment.
     */
    function initialize() external initializer {
        __AbstractModule_init();
    }

    /**
     *  @dev Sets the fee rate and collector of the given compliance
     *  @param _rate is the rate of the fee (0.01% = 1, 1% = 100, 100% = 10000)
     *  @param _collector is the collector wallet address
     *  Only the owner of the Compliance smart contract can call this function
     *  Collector wallet address must be verified
     */
    function setFee(uint256 _rate, address _collector) external onlyComplianceCall {
        address tokenAddress = IModularCompliance(msg.sender).getTokenBound();
        if (_rate > 10000) {
            revert FeeRateIsOutOfRange(msg.sender, _rate);
        }

        IIdentityRegistry identityRegistry = IToken(tokenAddress).identityRegistry();
        if (!identityRegistry.isVerified(_collector)) {
            revert CollectorAddressIsNotVerified(msg.sender, _collector);
        }

        _fees[msg.sender].rate = _rate;
        _fees[msg.sender].collector = _collector;
        emit FeeUpdated(msg.sender, _rate, _collector);
    }

    /**
     *  @dev See {IModule-moduleTransferAction}.
     */
    function moduleTransferAction(
        address _from,
        address _to,
        euint64 _value
    ) external override onlyComplianceCall returns (ebool) {
        address senderIdentity = _getIdentity(msg.sender, _from);
        address receiverIdentity = _getIdentity(msg.sender, _to);
        ebool isModuleTransfer = TFHE.asEbool(true);

        if (senderIdentity == receiverIdentity) {
            TFHE.allowTransient(isModuleTransfer, msg.sender);
            return isModuleTransfer;
        }

        Fee memory fee = _fees[msg.sender];
        if (fee.rate == 0 || _from == fee.collector || _to == fee.collector) {
            TFHE.allowTransient(isModuleTransfer, msg.sender);
            return isModuleTransfer;
        }
        euint64 feeAmount = TFHE.div(TFHE.mul(_value, TFHE.asEuint64(fee.rate)), 10000);

        IToken token = IToken(IModularCompliance(msg.sender).getTokenBound());
        TFHE.allowTransient(feeAmount, address(token));
        bool sent = token.forcedTransfer(_to, fee.collector, feeAmount);
        require(sent, "transfer fee collection failed");
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
    // solhint-disable-next-line no-unused-vars
    function moduleCheck(
        address _from,
        address _to,
        euint64 _value,
        address _compliance
    ) external override returns (ebool) {
        ebool isModuleCheck = TFHE.asEbool(true);
        TFHE.allowTransient(isModuleCheck, msg.sender);
        return TFHE.asEbool(true);
    }

    /**
     *  @dev getter for `_fees` variable
     *  @param _compliance the Compliance smart contract to be checked
     *  returns the Fee
     */
    function getFee(address _compliance) external view returns (Fee memory) {
        return _fees[_compliance];
    }

    /**
     *  @dev See {IModule-canComplianceBind}.
     */
    function canComplianceBind(address _compliance) external view returns (bool) {
        address tokenAddress = IModularCompliance(_compliance).getTokenBound();
        return AgentRole(tokenAddress).isAgent(address(this));
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
        return "TransferFeesModule";
    }

    /**
     *  @dev Returns the ONCHAINID (Identity) of the _userAddress
     *  @param _userAddress Address of the wallet
     *  internal function, can be called only from the functions of the Compliance smart contract
     */
    function _getIdentity(address _compliance, address _userAddress) internal view returns (address) {
        return
            address(IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().identity(_userAddress));
    }
}
