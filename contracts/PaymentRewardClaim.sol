// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./Configable.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPayment.sol";
import "./lib/TransferHelper.sol";

contract PaymentRewardClaim is Configable, Initializable {
    struct Period {
        address token; // Token for the reward
        uint256 userCount; // user count
        uint256 totalAmount; // total amount
        mapping(uint256 => bytes32) merkleRoot; // Merkle root for the group
        mapping(bytes32 => bool) hasClaimed; // Track if an user has claimed their reward in this period number
    
    }

    struct PeriodInfo {
        address token;
        uint256 userCount;
        uint256 totalAmount;
    }

    address public payment;
    bool public enabled;
    mapping(uint256 => Period) private periods; // Mapping of period number to Period
    event RewardClaimed(bytes32 indexed user, uint256 periodNumber, uint256 indexed amount, address token, address operator);

    modifier onlyEnabled() {
        require(enabled, 'disabled');
        _;
    }

    receive() external payable {
    }

    function initialize(address _payment) external initializer {
        owner = msg.sender;
        enabled = true;
        payment = _payment;
    }

    function withdraw(address _to, address _token, uint _amount) external onlyAdmin returns (uint) {
        return _withdraw(_to, _token, _amount);
    }

    // Function to claim reward from a specific group
    function claimReward(bytes32 _user, uint256 _periodNumber, uint256 _groupId, uint256 _amount, bytes32[] calldata _proof) external onlyEnabled {
        Period storage period = periods[_periodNumber];
        require(checkPeriodMerkleRoot(_periodNumber, _groupId), 'group disabled');
        require(!period.hasClaimed[_user], "Reward already claimed");
        bytes32 leaf = keccak256(abi.encodePacked(_user, _periodNumber, _groupId, _amount)); // Create leaf node

        require(_verify(period.merkleRoot[_groupId], _proof, leaf), "Invalid proof");

        if (period.token == address(0)) {
            IPayment(payment).simpleDeposit{value: _amount}(_user, period.token, _amount);
        } else {
            IPayment(payment).simpleDeposit(_user, period.token, _amount);
        }

        period.hasClaimed[_user] = true; // Mark as claimed
        period.userCount++;
        period.totalAmount += _amount;
        emit RewardClaimed(_user, _periodNumber, _amount, period.token, msg.sender);
    }

    function hasClaimed(uint256 _periodNumber, bytes32 _user) external view returns (bool) {
        return periods[_periodNumber].hasClaimed[_user];
    }

    // Function to verify the Merkle proof
    function _verify(bytes32 merkleRoot, bytes32[] memory proof, bytes32 leaf) internal pure returns (bool) {
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }

    function getBalance(address _token) public view returns (uint) {
        if(_token == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(_token).balanceOf(address(this));
        }
    }

    function getPeriodInfo(uint256 _periodNumber) external view returns (PeriodInfo memory) {
        return PeriodInfo({
            token: periods[_periodNumber].token,
            userCount: periods[_periodNumber].userCount,
            totalAmount: periods[_periodNumber].totalAmount
        });
    }

    function checkPeriodMerkleRoot(uint256 _periodNumber, uint256 _groupId) public view returns (bool) {
        return periods[_periodNumber].merkleRoot[_groupId] != 0x0000000000000000000000000000000000000000000000000000000000000000;
    }

    function _withdraw(address _to, address _token, uint _amount) internal returns (uint) {
        require(_amount > 0, 'zero');
        require(getBalance(_token) >= _amount, 'insufficient balance');

        if(_token == address(0)) {
            TransferHelper.safeTransferETH(_to, _amount);
        } else {
            TransferHelper.safeTransfer(IERC20(_token), _to, _amount);
        }

        return _amount;
    }

    // manager functions
    function setPeriod(uint256 _periodNumber, uint256 _groupId, address _token, bytes32 _merkleRoot) public onlyManager {
        periods[_periodNumber].merkleRoot[_groupId] = _merkleRoot;
        periods[_periodNumber].token = _token;
    }

    function batchSetPeriod(uint256[] memory _periodNumbers, uint256[] memory _groupIds, address[] memory _tokens, bytes32[] memory _merkleRoots) external  {
        require(_periodNumbers.length == _groupIds.length && _periodNumbers.length == _tokens.length && _periodNumbers.length == _merkleRoots.length, 'invalid length');
        for(uint256 i = 0; i < _periodNumbers.length; i++) {
            setPeriod(_periodNumbers[i], _groupIds[i], _tokens[i], _merkleRoots[i]);
        }
    }

    function setPaymentAllowance(
        address _token,
        uint256 _value
    ) public onlyManager {
        require(_token != address(0), 'zero address');
        TransferHelper.safeApprove(IERC20(_token), payment, _value);
    }

    function setEnabled(bool _enabled) external onlyDev {
        enabled = _enabled;
    }
}