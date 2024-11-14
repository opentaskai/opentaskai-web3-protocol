// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

interface IPayment {
  /**
    * @dev Allows a simple deposit without a serial number (SN), only available when nosnEnabled.
    *
    * @param _to The account identifier to receive the deposit.
    * @param _token The address of the token being deposited. If native ETH, use zero address.
    * @param _amount The amount of tokens being deposited.
    * @return A boolean value indicating whether the operation was successful.
    */
    function simpleDeposit(bytes32 _to, address _token, uint _amount) external payable returns(bool);
}