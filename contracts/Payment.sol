// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./lib/TransferHelper.sol";
import "./lib/Signature.sol";
import "./Configable.sol";

struct Account {
    uint available;
    uint frozen;
}

struct AssetAccount {
    address token;
    uint available;
    uint frozen;
}

struct DetailedAccount {
    address user;
    address token;
    uint available;
    uint frozen;
}

struct TransferData {
    address token;
    address from;
    address to;
    uint available;
    uint frozen;
    uint amount; //to 'address to'
    uint fee; // to 'address feeTo'
}

struct TradeData {
    address user;
    address token;
    uint amount;
    uint fee;
}

contract Payment is Configable, Initializable {
    using SafeMath for uint;
    
    bytes32 _domainHash;

    bool public enabled;
    bool public nosnEnabled;
    address public signer;
    address public feeTo;

    // sn, user
    mapping(bytes32 => address) public records;

    // user, token, account
    mapping(address => mapping(address => Account)) public userAccounts;

    event DepositLog(address indexed _user, address indexed _token, uint indexed _amount, address _from);
    event WithdrawLog(address indexed _user, address indexed _token, uint indexed _amount, address _from);
    event DepositDetailLog(bytes32 indexed _sn, address indexed _token, address _from, address _to, uint _available, uint _frozen);
    event WithdrawDetailLog(bytes32 indexed _sn, address indexed _token, address _from, address _to, uint _available, uint _frozen);
    event FreezeLog(bytes32 indexed _sn, address indexed _token, uint _amount, address _user);
    event UnfreezeLog(bytes32 indexed _sn, address indexed _token, uint _amount, address _user);
    event CancelLog(bytes32 indexed _sn, TradeData _userA, TradeData _userB);
    event TransferLog(bytes32 indexed _sn, address indexed _token, address _from, address _to, uint _available, uint _frozen, uint _amount, uint _fee);
    
    receive() external payable {
    }

    modifier onlyEnabled() {
        require(enabled, 'disabled');
        _;
    }

    modifier onlyNosnEnabled() {
        require(enabled && nosnEnabled, 'disabled');
        _;
    }

    function initialize() external initializer {
        owner = msg.sender;
        signer = msg.sender;
        feeTo = msg.sender;

        _domainHash = 0x0000000000000000000000000000000000000000000000000000000000000000;
        enabled = true;
        nosnEnabled = false;
    }

    function setSigner(address _user) external onlyDev {
        require(signer != _user, 'no change');
        signer = _user;
    }

    function setSignerContract(address _signer, bytes32 _hash) external onlyDev {
        require(signer != _signer || _domainHash != _hash, 'No change');
        signer = _signer;
        _domainHash = _hash;
    }

    function setFeeTo(address _user) external onlyAdmin {
        require(feeTo != _user, 'no change');
        feeTo = _user;
    }

    function setEnabled(bool _enabled) external onlyDev {
        enabled = _enabled;
    }

    function setNoSnEnabled(bool _enabled) external onlyDev {
        nosnEnabled = _enabled;
    }

    function deposit(address _to, address _token, uint _amount) external payable onlyNosnEnabled returns(bool) {
        emit DepositLog(_to, _token, _amount, msg.sender);
        _deposit(_token, _amount);
        
        Account storage userAccount = userAccounts[_to][_token];
        userAccount.available = userAccount.available.add(_amount);

        return true;
    }

    function withdraw(address _to, address _token, uint _amount) external onlyNosnEnabled {
        Account storage userAccount = userAccounts[msg.sender][_token];
        userAccount.available = userAccount.available.sub(_amount, 'insufficient available');

        emit WithdrawLog(_to, _token, _amount, msg.sender);
        _withdraw(_to, _token, _amount);
    }

    function depositAndFreeze(
        address _to, 
        address _token, 
        uint _available, 
        uint _frozen,
        bytes32 _sn,
        bytes memory _signature
    ) external payable onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        bytes32 messageHash = keccak256(abi.encodePacked(_to, _token, _available, _frozen, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");

        emit DepositDetailLog(_sn, _token, msg.sender, _to, _available, _frozen);

        _deposit(_token, _available + _frozen);

        records[_sn] = msg.sender;

        Account storage userAccount = userAccounts[_to][_token];
        userAccount.available = userAccount.available.add(_available);
        userAccount.frozen = userAccount.frozen.add(_frozen);

        return true;
    }

    function withdrawWithDetail(
        address _to, 
        address _token, 
        uint _available, 
        uint _frozen,
        bytes32 _sn,
        bytes memory _signature
    ) external onlyEnabled {
        require(records[_sn] == address(0), "record already exists");
        bytes32 messageHash = keccak256(abi.encodePacked(_to, _token, _available, _frozen, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        records[_sn] = msg.sender;

        Account storage userAccount = userAccounts[msg.sender][_token];
        userAccount.available = userAccount.available.sub(_available, 'insufficient available');
        userAccount.frozen = userAccount.frozen.sub(_frozen, 'insufficient frozen');
        
        emit WithdrawDetailLog(_sn, _token, msg.sender, _to, _available, _frozen);

        _withdraw(_to, _token, _available + _frozen);
    }

    function freeze(
        address _token, 
        uint _amount,
        bytes32 _sn,
        bytes memory _signature
    ) external onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        bytes32 messageHash = keccak256(abi.encodePacked(_token, _amount, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        Account storage userAccount = userAccounts[msg.sender][_token];
        userAccount.available = userAccount.available.sub(_amount, 'insufficient available');
        userAccount.frozen = userAccount.frozen.add(_amount);

        records[_sn] = msg.sender;
        emit FreezeLog(_sn, _token, _amount, msg.sender);
        return true;
    }

    function unfreeze(
        address _token, 
        uint _amount,
        bytes32 _sn,
        bytes memory _signature
    ) external onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        bytes32 messageHash = keccak256(abi.encodePacked(_token, _amount, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        TradeData memory data = TradeData({
            user: msg.sender,
            token: _token,
            amount: _amount,
            fee: 0
        });
        _unfreeze(data);

        records[_sn] = msg.sender;
        emit UnfreezeLog(_sn, _token, _amount, msg.sender);
        return true;
    }

    function transfer(
        bool _isWithdraw,
        TransferData memory deal,
        bytes32 _sn,
        bytes memory _signature
    ) external onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        require(deal.available + deal.frozen == deal.amount + deal.fee && deal.amount + deal.fee > 0, "invalid deal");
        bytes32 messageHash = keccak256(abi.encodePacked(deal.token, deal.from, deal.to, deal.available, deal.frozen, deal.amount, deal.fee, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        records[_sn] = msg.sender;
        emit TransferLog(_sn, deal.token, deal.from, deal.to, deal.available, deal.frozen, deal.amount, deal.fee);

        Account storage fromAccount = userAccounts[deal.from][deal.token];

        if(deal.available > 0) {
            fromAccount.available = fromAccount.available.sub(deal.available, 'insufficient available');
        }

        if(deal.frozen > 0) {
            fromAccount.frozen = fromAccount.frozen.sub(deal.frozen, 'insufficient frozen');
        }

        if(_isWithdraw) {
            if(deal.amount > 0) {
                _withdraw(deal.to, deal.token, deal.amount);
            }
            if(deal.fee > 0) {
                _withdraw(feeTo, deal.token, deal.fee);
            }
        } else {
            if(deal.amount > 0) {
                Account storage toAccount = userAccounts[deal.to][deal.token];
                toAccount.available = toAccount.available.add(deal.amount);
            }

            if(deal.fee > 0) {
                Account storage feeAccount = userAccounts[feeTo][deal.token];
                feeAccount.available = feeAccount.available.add(deal.fee);
            }
        }
        
        return true;
    }

    function cancel(
        TradeData memory _userA,
        TradeData memory _userB,
        bytes32 _sn,
        bytes memory _signature
    ) external onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        bytes32 messageHash = keccak256(abi.encodePacked(_sn, _userA.user, _userA.token, _userA.amount, _userA.fee, _userB.user, _userB.token, _userB.amount, _userB.fee, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        _unfreeze(_userA);
        _unfreeze(_userB);
        
        records[_sn] = msg.sender;
        emit CancelLog(_sn, _userA, _userB);
        return true;
    }

    function _unfreeze(TradeData memory _data) internal {
        Account storage userAccount = userAccounts[_data.user][_data.token];
        userAccount.frozen = userAccount.frozen.sub(_data.amount, 'insufficient frozen');
        userAccount.available = userAccount.available.add(_data.amount.sub(_data.fee, 'fee > amount'));

        if(_data.fee > 0) {
            Account storage feeAccount = userAccounts[feeTo][_data.token];
            feeAccount.available = feeAccount.available.add(_data.fee);
        }
    }

    function _deposit(address _token, uint _amount) internal onlyEnabled returns(uint) {
        require(_amount > 0, 'zero');
        if(_token == address(0)) {
            require(_amount == msg.value, 'invalid value');
        }

        if(_token != address(0)) {
            TransferHelper.safeTransferFrom(_token, msg.sender, address(this), _amount);
        }

        return _amount;
    }

    function _withdraw(address _to, address _token, uint _amount) internal returns (uint) {
        require(_amount > 0, 'zero');
        require(getBalance(_token) >= _amount, 'insufficient balance');

        if(_token == address(0)) {
            TransferHelper.safeTransferETH(_to, _amount);
        } else {
            TransferHelper.safeTransfer(_token, _to, _amount);
        }

        return _amount;
    }

    function getBalance(address _token) public view returns (uint) {
        if(_token == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(_token).balanceOf(address(this));
        }
    }

    function verifyMessage(
        bytes32 _messageHash,
        bytes memory _signature
    ) public view returns (bool) {
        bytes32 hash;
        if(_domainHash == 0x0000000000000000000000000000000000000000000000000000000000000000) {
            hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
        } else {
            hash = keccak256(abi.encodePacked("\x19\x01", _domainHash, _messageHash));
        }
        return Signature.verify(hash, signer, _signature);
    }

    function getUserAssets(address _user, address[] memory _tokens) external view returns (AssetAccount[] memory result) {
        result = new AssetAccount[](_tokens.length);
        for (uint i; i<_tokens.length; i++) {
            Account memory userAccount = userAccounts[_user][_tokens[i]];
            result[i] = AssetAccount({
                token: _tokens[i],
                available: userAccount.available,
                frozen: userAccount.frozen
            });
        }
        return result;
    }

    function getMultiUserAssets(address[] memory _users, address[] memory _tokens) external view returns (DetailedAccount[] memory result) {
        require(_users.length == _tokens.length, 'invalid parameters');
        result = new DetailedAccount[](_tokens.length);
        for (uint i; i<_tokens.length; i++) {
            Account memory userAccount = userAccounts[_users[i]][_tokens[i]];
            result[i] = DetailedAccount({
                user: _users[i],
                token: _tokens[i],
                available: userAccount.available,
                frozen: userAccount.frozen
            });
        }
        return result;
    }
    
}