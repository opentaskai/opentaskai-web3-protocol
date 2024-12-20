// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./Configable.sol";
import "./interfaces/IERC20.sol";
import "./lib/TransferHelper.sol";

contract RewardClaim is Configable, Initializable {
    struct Period {
        address token; // Token for the reward
        uint256 userCount; // user count
        uint256 totalAmount; // total amount
        mapping(uint256 => bytes32) merkleRoot; // Merkle root for the group
        mapping(address => bool) hasClaimed; // Track if an address has claimed their reward in this period number
    
    }

    struct PeriodInfo {
        address token;
        uint256 userCount;
        uint256 totalAmount;
    }

    bool public enabled;
    mapping(uint256 => Period) private periods; // Mapping of period number to Period
    event RewardClaimed(address indexed user, uint256 amount, uint256 periodNumber);

    modifier onlyEnabled() {
        require(enabled, 'disabled');
        _;
    }

    receive() external payable {
    }

    function initialize() external initializer {
        owner = msg.sender;
        enabled = true;
    }

    // Function to set period
    function setPeriod(uint256 _periodNumber, uint256 _groupId, address _token, bytes32 _merkleRoot) external onlyManager {
        periods[_periodNumber].merkleRoot[_groupId] = _merkleRoot;
        periods[_periodNumber].token = _token;
    }

    function batchSetPeriod(uint256[] memory _periodNumbers, uint256[] memory _groupIds, address[] memory _tokens, bytes32[] memory _merkleRoots) external onlyManager {
        require(_periodNumbers.length == _groupIds.length && _periodNumbers.length == _tokens.length && _periodNumbers.length == _merkleRoots.length, 'invalid length');
        for(uint256 i = 0; i < _periodNumbers.length; i++) {
            periods[_periodNumbers[i]].merkleRoot[_groupIds[i]] = _merkleRoots[i];
            periods[_periodNumbers[i]].token = _tokens[i];
        }
    }

    function setEnabled(bool _enabled) external onlyDev {
        enabled = _enabled;
    }

    function withdraw(address _to, address _token, uint _amount) external onlyAdmin returns (uint) {
        return _withdraw(_to, _token, _amount);
    }

    // Function to claim reward from a specific group
    function claimReward(uint256 _periodNumber, uint256 _groupId, uint256 _amount, bytes32[] calldata _proof) external onlyEnabled {
        Period storage period = periods[_periodNumber];
        require(checkPeriodMerkleRoot(_periodNumber, _groupId), 'group disabled');
        require(!period.hasClaimed[msg.sender], "Reward already claimed");
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, _periodNumber, _groupId, _amount)); // Create leaf node

        require(_verify(period.merkleRoot[_groupId], _proof, leaf), "Invalid proof");

        _withdraw(msg.sender, period.token, _amount);
        period.hasClaimed[msg.sender] = true; // Mark as claimed
        period.userCount++;
        period.totalAmount += _amount;
        emit RewardClaimed(msg.sender, _amount, _periodNumber);
    }

    function hasClaimed(uint256 _periodNumber, address _user) external view returns (bool) {
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
}