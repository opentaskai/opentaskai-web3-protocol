// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IERC20.sol";
import "./lib/TransferHelper.sol";
import "./lib/Signature.sol";
import "./Configable.sol";
import "./ReentrancyGuard.sol";

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
    bytes32 account;
    address token;
    uint available;
    uint frozen;
}

struct TransferData {
    address token; // Token address
    bytes32 from; // Sender's account number
    bytes32 to; // Recipient's account number
    uint available; // Amount deducted from sender's available balance
    uint frozen; // Amount deducted from sender's frozen balance
    uint amount; // Amount transferred to recipient's account
    uint fee; // Fee transferred to the fee account
    uint paid; // Amount paid by the sender, which is frozen in the sender's account
}

struct TradeData {
    bytes32 account;
    address token;
    uint amount;
    uint fee;
}

contract Payment is Configable, ReentrancyGuard, Initializable {
    bytes32 NONE;
    uint id;
    bytes32 domainHash;

    bool public enabled;
    bool public nosnEnabled;
    address public signer;
    address public feeTo;
    bytes32 public feeToAccount;

    // sn, account
    mapping(bytes32 => address) public records;

    bool public autoBindEnabled;
    uint public maxWalletCount;
    mapping(address => bytes32) public walletToAccount;
    mapping(bytes32 => address[]) public walletsOfAccount;

    // account, token, fund
    mapping(bytes32 => mapping(address => Account)) public userAccounts;


    event SimpleDepositLog(bytes32 indexed _to, address indexed _token, uint indexed _amount, address _operator);
    event SimpleWithdrawLog(address indexed _token, uint indexed _amount, bytes32 _from, address _to, address _operator);
    event DepositLog(bytes32 indexed _sn, address indexed _token, bytes32 _to, uint _amount, uint _frozen, address _operator);
    event WithdrawLog(bytes32 indexed _sn, address indexed _token, bytes32 _from, address _to, uint _available, uint _frozen, address _operator);
    event FreezeLog(bytes32 indexed _sn, bytes32 indexed _account, address indexed _token, uint _amount, address _operator);
    event UnfreezeLog(bytes32 indexed _sn, bytes32 indexed _account, address indexed _token, uint _amount, uint _fee, address _operator);
    event CancelLog(bytes32 indexed _sn, TradeData _userA, TradeData _userB, address _operator);
    event TransferLog(bytes32 indexed _sn, TransferData _deal, address _out, address _operator);
    event BindLog(bytes32 indexed _account, address _wallet, address indexed _operator);
    event UnbindLog(bytes32 indexed _account, address _wallet, address indexed _operator);
    
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
        uint _id;
        assembly {
            _id := chainid()
        }
        id = _id;
        maxWalletCount = 1;
        NONE = 0x0000000000000000000000000000000000000000000000000000000000000000;
        domainHash = NONE;
        enabled = true;
        nosnEnabled = false;
        autoBindEnabled = true;

        owner = msg.sender;
        signer = msg.sender;
        feeTo = msg.sender;
        feeToAccount = 0x0000000000000000000000000000000000000000000000000000000000000001;
        _bindAccount(feeTo, feeToAccount);
    }

    function setSigner(address _signer) external onlyDev {
        require(signer != _signer, 'no change');
        signer = _signer;
    }

    function setSignerContract(address _signer, bytes32 _hash) external onlyDev {
        require(signer != _signer || domainHash != _hash, 'No change');
        signer = _signer;
        domainHash = _hash;
    }

    function setFeeTo(address _feeTo) external onlyAdmin {
        require(feeTo != _feeTo, 'no change');
        walletToAccount[feeTo] = NONE;
        walletsOfAccount[feeToAccount].pop();

        feeTo = _feeTo;
        _bindAccount(feeTo, feeToAccount);
    }

    function setEnabled(bool _enabled) external onlyDev {
        enabled = _enabled;
    }

    function setNoSnEnabled(bool _enabled) external onlyDev {
        nosnEnabled = _enabled;
    }

    function setAutoBindEnabled(bool _enabled) external onlyDev {
        autoBindEnabled = _enabled;
    }

    function setMaxWalletCount(uint _value) external onlyDev {
        maxWalletCount = _value;
    }

    function _bindAccount(address _wallet, bytes32 _account) internal {
        require(walletsOfAccount[_account].length < maxWalletCount, 'over wallet count');
        walletToAccount[_wallet] = _account;
        walletsOfAccount[_account].push(_wallet);
        emit BindLog(_account, _wallet, msg.sender);
    }

    /**
     * @dev Binds a user's wallet to their account using a signature for verification.
     *
     * @param _account The account identifier to bind.
     * @param _sn A unique serial number for the binding operation.
     * @param _expired Timestamp after which the binding request is considered expired.
     * @param _signature The digital signature for authenticating the request.
     */
    function bindAccount(
        bytes32 _account, 
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external onlyEnabled {
        require(records[_sn] == address(0), "record already exists");
        require(walletToAccount[msg.sender] == NONE, 'already bound');
        require(_expired > block.timestamp, "request is expired");
        require(_account != feeToAccount, "forbidden");
        bytes32 messageHash = keccak256(abi.encodePacked(_account, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        _bindAccount(msg.sender, _account);
        records[_sn] = msg.sender;
    }

    /**
    * @dev Unbinds the caller's wallet from their account.
    */
    function _unbindAccount(address _user) internal {
        bytes32 account = walletToAccount[_user];
        require(account != NONE, 'no bound');
        walletToAccount[_user] = NONE;
        uint index = indexAccount(account, _user);
        if(index < walletsOfAccount[account].length-1) {
            walletsOfAccount[account][index] = walletsOfAccount[account][walletsOfAccount[account].length-1];
        }
        walletsOfAccount[account].pop();
        emit UnbindLog(account, _user, msg.sender);
    }

    /**
    * @dev Unbinds the caller's wallet from their account.
    */
    function unbindAccount() external {
        _unbindAccount(msg.sender);
    }

    /**
     * @dev Replace user's wallet to their account using a signature for verification.
     *
     * @param _account The account identifier to bind.
     * @param _wallet The binded wallet address identifier to unbind.
     * @param _sn A unique serial number for the binding operation.
     * @param _expired Timestamp after which the binding request is considered expired.
     * @param _signature The digital signature for authenticating the request.
     */
    function replaceAccount(
        bytes32 _account, 
        address _wallet, 
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external onlyEnabled {
        require(records[_sn] == address(0), "record already exists");
        require(_wallet != msg.sender, 'no change');
        require(walletToAccount[_wallet] == _account, 'no bound');
        require(walletToAccount[msg.sender] == NONE, 'already bound');
        require(_expired > block.timestamp, "request is expired");
        require(_account != feeToAccount, "forbidden");
        bytes32 messageHash = keccak256(abi.encodePacked(_account, _wallet, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        _unbindAccount(_wallet);
        _bindAccount(msg.sender, _account);
        records[_sn] = msg.sender;
    }

    /**
    * @dev Allows a simple deposit without a serial number (SN), only available when nosnEnabled.
    *
    * @param _to The account identifier to receive the deposit.
    * @param _token The address of the token being deposited. If native ETH, use zero address.
    * @param _amount The amount of tokens being deposited.
    * @return A boolean value indicating whether the operation was successful.
    */
    function simpleDeposit(bytes32 _to, address _token, uint _amount) external payable nonReentrant onlyNosnEnabled returns(bool) {
        _deposit(_token, _amount);
        emit SimpleDepositLog(_to, _token, _amount, msg.sender);
        
        Account storage userAccount = userAccounts[_to][_token];
        userAccount.available = userAccount.available + _amount;

        return true;
    }

    /**
    * @dev Allows a simple withdrawal without a serial number (SN), only available when nosnEnabled.
    *
    * @param _to The address to send the withdrawn funds to.
    * @param _token The address of the token being withdrawn. If native ETH, use zero address.
    * @param _amount The amount of tokens to withdraw.
    */
    function simpleWithdraw(address _to, address _token, uint _amount) external nonReentrant onlyNosnEnabled {
        bytes32 from = walletToAccount[msg.sender];
        Account storage userAccount = userAccounts[from][_token];
        require(userAccount.available >= _amount, 'insufficient available');
        userAccount.available = userAccount.available - _amount;
        
        _withdraw(_to, _token, _amount);
        emit SimpleWithdrawLog(_token, _amount, from, _to, msg.sender);
    }

    /**
    * @dev Executes a deposit operation with additional parameters and signature verification.
    *
    * @param _to The account identifier to receive the deposit.
    * @param _token The address of the token being deposited. If native ETH, use zero address.
    * @param _amount The paid amount of tokens being deposited.
    * @param _frozen The amount of the deposit that should be immediately frozen.
    * @param _sn A unique serial number for the deposit operation.
    * @param _expired Timestamp after which the deposit request is considered expired.
    * @param _signature The digital signature for authenticating the request.
    * @return A boolean value indicating whether the operation was successful.
    */
    function deposit(
        bytes32 _to, 
        address _token, 
        uint _amount,
        uint _frozen,
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external payable nonReentrant onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        require(_expired > block.timestamp, "request is expired");
        bytes32 messageHash = keccak256(abi.encodePacked(_to, _token, _amount, _frozen, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        if (autoBindEnabled && walletsOfAccount[_to].length == 0) {
            _bindAccount(msg.sender, _to);
        }
        require(walletsOfAccount[_to].length >0,  "no bind");
        
        records[_sn] = msg.sender;
        _deposit(_token, _amount);

        Account storage userAccount = userAccounts[_to][_token];
        uint available = userAccount.available + _amount;
        require(available >= _frozen, "insufficient available");
        
        userAccount.available = available - _frozen;
        userAccount.frozen = userAccount.frozen + _frozen;
        
        emit DepositLog(_sn, _token, _to, _amount, _frozen, msg.sender);
        return true;
    }

    /**
    * @dev Executes a withdrawal operation with additional parameters and signature verification.
    *
    * @param _to The address to send the withdrawn funds to.
    * @param _token The address of the token being withdrawn. If native ETH, use zero address.
    * @param _available The amount of available (not frozen) tokens to withdraw.
    * @param _frozen The amount of frozen tokens to withdraw.
    * @param _sn A unique serial number for the withdrawal operation.
    * @param _expired Timestamp after which the withdrawal request is considered expired.
    * @param _signature The digital signature for authenticating the request.
    */
    function withdraw(
        address _to, 
        address _token, 
        uint _available, 
        uint _frozen,
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external nonReentrant onlyEnabled {
        require(records[_sn] == address(0), "record already exists");
        require(_expired > block.timestamp, "request is expired");
        bytes32 messageHash = keccak256(abi.encodePacked(_to, _token, _available, _frozen, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        
        records[_sn] = msg.sender;
        bytes32 from = walletToAccount[msg.sender];
        Account storage userAccount = userAccounts[from][_token];
        require(userAccount.available >= _available, 'insufficient available');
        require(userAccount.frozen >= _frozen, 'insufficient frozen');
        userAccount.available = userAccount.available - _available;
        userAccount.frozen = userAccount.frozen - _frozen;
        
        _withdraw(_to, _token, _available + _frozen);
        emit WithdrawLog(_sn, _token, from, _to, _available, _frozen, msg.sender);
    }

    /**
    * @dev Freezes a specified amount of tokens in an account.
    *
    * @param _account The account identifier whose funds are to be frozen.
    * @param _token The address of the token being frozen. If native ETH, use zero address.
    * @param _amount The amount of tokens to freeze.
    * @param _sn A unique serial number for the freeze operation.
    * @param _expired Timestamp after which the freeze request is considered expired.
    * @param _signature The digital signature for authenticating the request.
    * @return A boolean value indicating whether the operation was successful.
    */
    function freeze(
        bytes32 _account,
        address _token, 
        uint _amount,
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external nonReentrant onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        require(_expired > block.timestamp, "request is expired");
        bytes32 messageHash = keccak256(abi.encodePacked(_account, _token, _amount, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        bytes32 operatorAccount = walletToAccount[msg.sender];
        if (operatorAccount != _account && msg.sender != admin()) {
            revert("forbidden");
        }
        Account storage userAccount = userAccounts[_account][_token];
        require(userAccount.available >= _amount, 'insufficient available');
        userAccount.available = userAccount.available - _amount;
        userAccount.frozen = userAccount.frozen + _amount;

        records[_sn] = msg.sender;
        emit FreezeLog(_sn, _account, _token, _amount, msg.sender);
        return true;
    }

    /**
    * @dev Unfreezes a specified amount of tokens in an account.
    *
    * @param _account The account identifier whose funds are to be unfrozen.
    * @param _token The address of the token being unfrozen. If native ETH, use zero address.
    * @param _amount The amount of tokens to unfreeze.
    * @param _fee // Fee transferred to the fee account
    * @param _sn A unique serial number for the unfreeze operation.
    * @param _expired Timestamp after which the unfreeze request is considered expired.
    * @param _signature The digital signature for authenticating the request.
    * @return A boolean value indicating whether the operation was successful.
    */
    function unfreeze(
        bytes32 _account,
        address _token, 
        uint _amount,
        uint _fee,
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external nonReentrant onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        require(_expired > block.timestamp, "request is expired");
        require(_amount > _fee, "amount must greater than fee");
        bytes32 messageHash = keccak256(abi.encodePacked(_account, _token, _amount, _fee, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        bytes32 operatorAccount = walletToAccount[msg.sender];
        if (operatorAccount != _account && msg.sender != admin()) {
            revert("forbidden");
        }
        
        TradeData memory data = TradeData({
            account: _account,
            token: _token,
            amount: _amount,
            fee: _fee
        });
        _unfreeze(data);

        records[_sn] = msg.sender;
        emit UnfreezeLog(_sn, _account, _token, _amount, _fee, msg.sender);
        return true;
    }

    /**
    * @dev Transfers funds between accounts or to an external address, with fee deduction.
    *
    * @param _out The external address to send the amount to. If zero address, transfer between internal accounts.
    * @param _deal A struct containing details of the transfer including token, from, to, amounts, and fee.
    * @param _sn A unique serial number for the transfer operation.
    * @param _expired Timestamp after which the transfer request is considered expired.
    * @param _signature The digital signature for authenticating the request.
    * @return A boolean value indicating whether the operation was successful.
    */
    function transfer(
        address _out,
        TransferData calldata _deal,
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external nonReentrant onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        require(_expired > block.timestamp, "request is expired");
        require(_deal.available + _deal.frozen == _deal.amount + _deal.fee && _deal.amount + _deal.fee > 0 && _deal.paid >= _deal.frozen, "invalid deal");
        bytes32 messageHash = keccak256(abi.encodePacked(_out, _deal.token, _deal.from, _deal.to, _deal.available, _deal.frozen, _deal.amount, _deal.fee, _deal.paid, _sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        bool isFrom = foundAccount(_deal.from, msg.sender);
        bool isTo = foundAccount(_deal.to, msg.sender);
        if( !(isFrom || isTo) && msg.sender != admin()) {
            revert("forbidden");
        }
        
        records[_sn] = msg.sender;
        
        Account storage fromAccount = userAccounts[_deal.from][_deal.token];
        // Deduct from available balance when frozen balance is insufficient
        if(_deal.available > 0) {
            require(fromAccount.available >= _deal.available, 'insufficient available');
            fromAccount.available = fromAccount.available - _deal.available;
        }

        if(_deal.frozen > 0) {
            require(fromAccount.frozen >= _deal.paid, 'insufficient frozen');
            fromAccount.frozen = fromAccount.frozen - _deal.frozen;
            // if paid greater than 'frozen', it indicates that the excess amount needs to be unfrozen
            if(_deal.paid > _deal.frozen) {
                uint excessAmount = _deal.paid - _deal.frozen;
                fromAccount.frozen = fromAccount.frozen - excessAmount;
                fromAccount.available = fromAccount.available + excessAmount; 
            }
        }

        if(_out != address(0)) {
            if(_deal.amount > 0) {
                _withdraw(_out, _deal.token, _deal.amount);
            }
            if(_deal.fee > 0) {
                _withdraw(feeTo, _deal.token, _deal.fee);
            }
        } else {
            if(_deal.amount > 0) {
                Account storage toAccount = userAccounts[_deal.to][_deal.token];
                toAccount.available = toAccount.available + _deal.amount;
            }

            if(_deal.fee > 0) {
                Account storage feeAccount = userAccounts[feeToAccount][_deal.token];
                feeAccount.available = feeAccount.available + _deal.fee;
            }
        }
        
        emit TransferLog(_sn, _deal, _out, msg.sender);
        return true;
    }

    /**
    * @dev Cancels a trade by unfreezing the specified amounts for both parties involved.
    *
    * @param _userA The trade data for the first party in the trade.
    * @param _userB The trade data for the second party in the trade.
    * @param _sn A unique serial number for the cancel operation.
    * @param _expired Timestamp after which the cancel request is considered expired.
    * @param _signature The digital signature for authenticating the request.
    * @return A boolean value indicating whether the operation was successful.
    */
    function cancel(
        TradeData calldata _userA,
        TradeData calldata _userB,
        bytes32 _sn,
        uint _expired,
        bytes calldata _signature
    ) external nonReentrant onlyEnabled returns(bool) {
        require(records[_sn] == address(0), "record already exists");
        require(_expired > block.timestamp, "request is expired");
        bytes32 messageHash = keccak256(abi.encodePacked(_sn, _userA.account, _userA.token, _userA.amount, _userA.fee, _userB.account, _userB.token, _userB.amount, _userB.fee, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        bool a = foundAccount(_userA.account, msg.sender);
        bool b = foundAccount(_userB.account, msg.sender);
        if( !(a || b) && msg.sender != admin()) {
            revert("forbidden");
        }

        _unfreeze(_userA);
        _unfreeze(_userB);
        
        records[_sn] = msg.sender;
        emit CancelLog(_sn, _userA, _userB, msg.sender);
        return true;
    }

    function _unfreeze(TradeData memory _data) internal {
        Account storage userAccount = userAccounts[_data.account][_data.token];
        require(userAccount.frozen >= _data.amount, 'insufficient frozen');
        require(_data.amount >= _data.fee, 'fee > amount');
        userAccount.frozen = userAccount.frozen - _data.amount;
        userAccount.available = userAccount.available + _data.amount - _data.fee;

        if(_data.fee > 0) {
            Account storage feeAccount = userAccounts[feeToAccount][_data.token];
            feeAccount.available = feeAccount.available + _data.fee;
        }
    }

    function _deposit(address _token, uint _amount) internal returns(uint) {
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
        bytes calldata _signature
    ) public view returns (bool) {
        bytes32 hash;
        if(domainHash == 0x0000000000000000000000000000000000000000000000000000000000000000) {
            hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
        } else {
            hash = keccak256(abi.encodePacked("\x19\x01", domainHash, _messageHash));
        }
        return Signature.verify(hash, signer, _signature);
    }

    function getUserAssets(bytes32 _account, address[] calldata _tokens) external view returns (AssetAccount[] memory result) {
        result = new AssetAccount[](_tokens.length);
        for (uint i; i<_tokens.length; i++) {
            Account memory userAccount = userAccounts[_account][_tokens[i]];
            result[i] = AssetAccount({
                token: _tokens[i],
                available: userAccount.available,
                frozen: userAccount.frozen
            });
        }
        return result;
    }

    function getMultiUserAssets(bytes32[] calldata _accounts, address[] memory _tokens) external view returns (DetailedAccount[] memory result) {
        require(_accounts.length == _tokens.length, 'invalid parameters');
        result = new DetailedAccount[](_tokens.length);
        for (uint i; i<_tokens.length; i++) {
            Account memory userAccount = userAccounts[_accounts[i]][_tokens[i]];
            result[i] = DetailedAccount({
                account: _accounts[i],
                token: _tokens[i],
                available: userAccount.available,
                frozen: userAccount.frozen
            });
        }
        return result;
    }
    
    function getRecords(bytes32[] calldata _sns) external view returns (address[] memory result) {
        result = new address[](_sns.length);
        for (uint i; i<_sns.length; i++) {
            result[i] = records[_sns[i]];
        }
    }

    function getWalletsOfAccount(bytes32 _account) external view returns (address[] memory) {
        return walletsOfAccount[_account];
    }

    function foundAccount(bytes32 _account, address _wallet) public view returns (bool) {
        uint index = indexAccount(_account, _wallet);
        if(index != walletsOfAccount[_account].length) return true;
        return false;
    }

    function indexAccount(bytes32 _account, address _wallet) internal view returns (uint) {
        uint index = walletsOfAccount[_account].length;
        for(uint i; i < walletsOfAccount[_account].length; i++) {
            if(_wallet == walletsOfAccount[_account][i]) {
                index = i;
            }
        }
        return index;
    }
}