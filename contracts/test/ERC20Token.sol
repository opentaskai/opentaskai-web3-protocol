// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is ERC20, ReentrancyGuard, Ownable {
    uint8 private _decimals = 18;
    uint256 public claimCount;
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address _to, uint256 amount_) external onlyOwner {
        _mint(_to, amount_);
    }

    function burn(uint256 amount_) external {
        _burn(msg.sender, amount_);
    }

    function claim() external {
        uint256 balance = balanceOf(msg.sender);
        require(claimCount > balance, 'can not claim');
        _mint(msg.sender, claimCount - balance);
    }

    function setClaimAmount(uint256 amount_) external onlyOwner {
        require(claimCount != amount_, 'no change');
        claimCount = amount_;
    }
}