// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

contract Config {
    address public owner;
    address public dev;
    address public admin;

    event OwnerChanged(address indexed _user, address indexed _old, address indexed _new);
    event DevChanged(address indexed _user, address indexed _old, address indexed _new);
    event AdminChanged(address indexed _user, address indexed _old, address indexed _new);

    constructor() {
        owner = msg.sender;
        dev = msg.sender;
        admin = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, 'only owner');
        _;
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "admin forbidden");
        _;
    }
    
    modifier onlyDev() {
        require(msg.sender == dev || msg.sender == owner, "dev forbidden");
        _;
    }

    function changeOwner(address _user) external onlyOwner {
        require(owner != _user, 'no change');
        emit OwnerChanged(msg.sender, owner, _user);
        owner = _user;
    }

    function changeDev(address _user) external onlyDev {
        require(dev != _user, 'no change');
        emit DevChanged(msg.sender, dev, _user);
        dev = _user;
    }

    function changeAdmin(address _user) external onlyAdmin {
        require(admin != _user, 'no change');
        emit AdminChanged(msg.sender, admin, _user);
        admin = _user;
    }
}