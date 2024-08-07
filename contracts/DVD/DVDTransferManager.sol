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

import "../roles/AgentRole.sol";
import "../token/IToken.sol";
import "fhevm/lib/TFHE.sol";
import "hardhat/console.sol";

contract DVDTransferManager is Ownable {
    /// Types

    struct Delivery {
        address counterpart;
        address token;
        euint64 amount;
    }

    /// variables

    // tokens to deliver by DVD transfer maker
    mapping(bytes32 => Delivery) public token1ToDeliver;

    // tokens to deliver by DVD transfer taker
    mapping(bytes32 => Delivery) public token2ToDeliver;

    // nonce of the transaction allowing the creation of unique transferID
    uint256 public txNonce;

    /// events

    /**
     * @dev Emitted when a DVD transfer is initiated by `maker` to swap `token1Amount` tokens `token1` (TREX or not)
     * for `token2Amount` tokens `token2` with `taker`
     * this event is emitted by the `initiateDVDTransfer` function
     */
    event DVDTransferInitiated(
        bytes32 indexed transferID,
        address maker,
        address indexed token1,
        address taker,
        address indexed token2
    );

    /**
     * @dev Emitted when a DVD transfer is validated by `taker` and
     * executed either by `taker` either by the agent of the TREX token
     * if the TREX token is subject to conditional transfers
     * this event is emitted by the `takeDVDTransfer` function
     */
    event DVDTransferExecuted(bytes32 indexed transferID);

    /**
     * @dev Emitted when a DVD transfer is cancelled
     * this event is emitted by the `cancelDVDTransfer` function
     */
    event DVDTransferCancelled(bytes32 indexed transferID);

    /// functions

    // initiates the nonce at 0
    constructor() Ownable(msg.sender) {
        txNonce = 0;
    }

    /**
     *  @dev initiates a DVD transfer between `msg.sender` & `_counterpart`
     *  @param _token1 the address of the token (ERC20 or TREX) provided by `msg.sender`
     *  @param _encryptedAmountToken1 the amount of `_token1` encrypted that `msg.sender` will send to
     *  `_counterpart` at DVD execution time
     *  @param _inputProofToken1 the proof that the msg.sender have access to the cypher
     *  @param _counterpart the address of the counterpart, which will receive `_token1Amount` of
     *  `_token1` in exchange for `_token2Amount` of `_token2`
     *  @param _token2 the address of the token (ERC20 or TREX) provided by `_counterpart`
     *  @param _encryptedAmountToken2 the amount of `_token2` encrypted that `_counterpart` will send to
     *  `msg.sender` at DVD execution time
     *  @param _inputProofToken2 the proof that the msg.sender have access to the cypher
     */
    function initiateDVDTransfer(
        address _token1,
        einput _encryptedAmountToken1,
        bytes calldata _inputProofToken1,
        address _counterpart,
        address _token2,
        einput _encryptedAmountToken2,
        bytes calldata _inputProofToken2
    ) external {
        initiateDVDTransfer(
            _token1,
            TFHE.asEuint64(_encryptedAmountToken1, _inputProofToken1),
            _counterpart,
            _token2,
            TFHE.asEuint64(_encryptedAmountToken2, _inputProofToken2)
        );
    }

    /**
     *  @dev initiates a DVD transfer between `msg.sender` & `_counterpart`
     *  @param _token1 the address of the token (ERC20 or TREX) provided by `msg.sender`
     *  @param _token1Amount the amount of `_token1` encrypted that `msg.sender` will send to `_counterpart`
     *  at DVD execution time
     *  @param _counterpart the address of the counterpart, which will receive `_token1Amount` of `_token1`
     *  in exchange for `_token2Amount` of `_token2`
     *  @param _token2 the address of the token (ERC20 or TREX) provided by `_counterpart`
     *  @param _token2Amount the amount of `_token2` encrypted that `_counterpart` will send to `msg.sender`
     *  at DVD execution time
     *  requires `_counterpart` to not be the 0 address
     *  emits a `DVDTransferInitiated` event
     */
    function initiateDVDTransfer(
        address _token1,
        euint64 _token1Amount,
        address _counterpart,
        address _token2,
        euint64 _token2Amount
    ) public {
        require(TFHE.isSenderAllowed(_token1Amount));
        require(TFHE.isSenderAllowed(_token2Amount));
        require(_counterpart != address(0), "counterpart cannot be null");
        Delivery memory token1;
        token1.counterpart = msg.sender;
        token1.token = _token1;
        token1.amount = _token1Amount;
        Delivery memory token2;
        token2.counterpart = _counterpart;
        token2.token = _token2;
        token2.amount = _token2Amount;
        bytes32 transferID = calculateTransferID(
            txNonce,
            token1.counterpart,
            token1.token,
            token1.amount,
            token2.counterpart,
            token2.token,
            token2.amount
        );
        token1ToDeliver[transferID] = token1;
        token2ToDeliver[transferID] = token2;
        TFHE.allow(token1.amount, address(this));
        TFHE.allow(token2.amount, address(this));
        emit DVDTransferInitiated(transferID, token1.counterpart, token1.token, token2.counterpart, token2.token);
        txNonce++;
    }

    /**
     *  @dev execute a DVD transfer that was previously initiated through the `initiateDVDTransfer` function
     *  @param _transferID the DVD transfer identifier as calculated through
     *  the `calculateTransferID` function for the initiated DVD transfer to execute
     *  requires `_transferID` to exist (DVD transfer has to be initiated)
     *  requires that `msg.sender` is the taker OR the TREX agent in case a
     *  TREX token is involved in the transfer (in case of conditional transfer
     *  the agent can call the function when the transfer has been approved)
     *  once the DVD transfer is executed the `_transferID` is removed from the pending `_transferID` pool
     *  emits a `DVDTransferExecuted` event
     */
    function takeDVDTransfer(bytes32 _transferID) external {
        Delivery memory token1 = token1ToDeliver[_transferID];
        Delivery memory token2 = token2ToDeliver[_transferID];
        require(token1.counterpart != address(0) && token2.counterpart != address(0), "transfer ID does not exist");
        IERC20 token1Contract = IERC20(token1.token);
        IERC20 token2Contract = IERC20(token2.token);
        require(
            msg.sender == token2.counterpart || isTREXAgent(token1.token, msg.sender) || isTREXAgent(token2.token, msg.sender),
            "transfer has to be done by the counterpart or by owner"
        );
        TFHE.allowTransient(token1.amount, address(token1Contract));
        TFHE.allowTransient(token2.amount, address(token2Contract));
        token1Contract.transferFrom(token1.counterpart, token2.counterpart, token1.amount);
        token2Contract.transferFrom(token2.counterpart, token1.counterpart, token2.amount);
        delete token1ToDeliver[_transferID];
        delete token2ToDeliver[_transferID];
        emit DVDTransferExecuted(_transferID);
    }

    /**
     *  @dev delete a pending DVD transfer that was previously initiated
     *  through the `initiateDVDTransfer` function from the pool
     *  @param _transferID the DVD transfer identifier as calculated through
     *  the `calculateTransferID` function for the initiated DVD transfer to delete
     *  requires `_transferID` to exist (DVD transfer has to be initiated)
     *  requires that `msg.sender` is the taker or the maker or the `DVDTransferManager` contract
     *  owner or the TREX agent in case a TREX token is involved in the transfer
     *  once the `cancelDVDTransfer` is executed the `_transferID` is removed from the pending `_transferID` pool
     *  emits a `DVDTransferCancelled` event
     */
    function cancelDVDTransfer(bytes32 _transferID) external {
        Delivery memory token1 = token1ToDeliver[_transferID];
        Delivery memory token2 = token2ToDeliver[_transferID];
        require(token1.counterpart != address(0) && token2.counterpart != address(0), "transfer ID does not exist");
        require(
            msg.sender == token2.counterpart ||
                msg.sender == token1.counterpart ||
                msg.sender == owner() ||
                isTREXAgent(token1.token, msg.sender) ||
                isTREXAgent(token2.token, msg.sender),
            "you are not allowed to cancel this transfer"
        );
        delete token1ToDeliver[_transferID];
        delete token2ToDeliver[_transferID];
        emit DVDTransferCancelled(_transferID);
    }

    /**
     *  @dev check if `_token` corresponds to a functional TREX token (with identity registry initiated)
     *  @param _token the address token to check
     *  the function will try to call `identityRegistry()` on
     *  the address, which is a getter specific to TREX tokens
     *  if the call pass and returns an address it means that
     *  the token is a TREX, otherwise it's not a TREX
     *  return `true` if the token is a TREX, `false` otherwise
     */
    function isTREX(address _token) public view returns (bool) {
        try IToken(_token).identityRegistry() returns (IIdentityRegistry _ir) {
            if (address(_ir) != address(0)) {
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     *  @dev check if `_user` is a TREX agent of `_token`
     *  @param _token the address token to check
     *  @param _user the wallet address
     *  if `_token` is a TREX token this function will check if `_user` is registered as an agent on it
     *  return `true` if `_user` is agent of `_token`, return `false` otherwise
     */
    function isTREXAgent(address _token, address _user) public view returns (bool) {
        if (isTREX(_token)) {
            return AgentRole(_token).isAgent(_user);
        }
        return false;
    }

    /**
     *  @dev check if `_user` is a TREX owner of `_token`
     *  @param _token the address token to check
     *  @param _user the wallet address
     *  if `_token` is a TREX token this function will check if `_user` is registered as an owner on it
     *  return `true` if `_user` is owner of `_token`, return `false` otherwise
     */
    function isTREXOwner(address _token, address _user) public view returns (bool) {
        if (isTREX(_token)) {
            return Ownable(_token).owner() == _user;
        }
        return false;
    }

    /**
     *  @dev calculates the parity byte signature
     *  @param _token1 the address of the base token
     *  @param _token2 the address of the counterpart token
     *  return the byte signature of the parity
     */
    function calculateParity(address _token1, address _token2) public pure returns (bytes32) {
        bytes32 parity = keccak256(abi.encode(_token1, _token2));
        return parity;
    }

    /**
     *  @dev calculates the transferID depending on DVD transfer parameters
     *  @param _nonce the nonce of the transfer on the smart contract
     *  @param _maker the address of the DVD transfer maker (initiator of the transfer)
     *  @param _token1 the address of the token that the maker is providing
     *  @param _token1Amount the amount of tokens encrypted `_token1` provided by the maker
     *  @param _taker the address of the DVD transfer taker (executor of the transfer)
     *  @param _token2 the address of the token that the taker is providing
     *  @param _token2Amount the amount of tokens encrypted `_token2` provided by the taker
     *  return the identifier of the DVD transfer as a byte signature
     */
    function calculateTransferID(
        uint256 _nonce,
        address _maker,
        address _token1,
        euint64 _token1Amount,
        address _taker,
        address _token2,
        euint64 _token2Amount
    ) public pure returns (bytes32) {
        bytes32 transferID = keccak256(abi.encode(_nonce, _maker, _token1, _token1Amount, _taker, _token2, _token2Amount));
        return transferID;
    }
}
