// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;


import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/ISBT.sol";
import "./lib/Signature.sol";
import "./lib/Base64.sol";
import "./utils/Strings.sol";
import "./Configable.sol";
import "./ERC721/extensions/ERC165.sol";


contract SBT is ERC165, Configable, Initializable {
    using Strings for uint;

    string public name;
    string public symbol;
    bytes32 _domainHash;
    bool public enabled;
    address public signer;

    // sn, token id
    mapping(bytes32 => uint) public records;
    // token id, user address
    mapping(uint => address) public owners;
    // user address, token id
    mapping(address => uint) public ids;

    // token id, value
    mapping(uint => uint) public values;
    
    string image;

    event ClaimLog(bytes32 indexed _sn, uint indexed _tokenId, address indexed _user);

    modifier onlyEnabled() {
        require(enabled, 'disabled');
        _;
    }

    function initialize(string memory _name, string memory _symbol) external initializer {
        owner = msg.sender;
        signer = msg.sender;
        name = _name;
        symbol = _symbol;
        _domainHash = 0x0000000000000000000000000000000000000000000000000000000000000000;
        enabled = true;
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

    function setEnabled(bool _enabled) external onlyDev {
        enabled = _enabled;
    }

    function setImage(string memory _image) external onlyDev {
        image = _image;
    }

    function updateValue(
        uint _tokenId, 
        uint _value,
        bytes32 _sn,
        bytes calldata _signature
    ) external {
        require(_tokenId > 0, 'invalid token id');
        require(values[_tokenId] != _value, 'no change');
        bytes32 messageHash = keccak256(abi.encodePacked(_tokenId, _value, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");

        values[_tokenId] = _value;
    }

    function claim(
        uint _tokenId,
        uint _value,
        bytes32 _sn,
        bytes calldata _signature
    ) external payable onlyEnabled returns(bool) {
        require(_tokenId > 0, 'invalid token id');
        require(records[_sn] == 0, "record already exists");
        require(owners[_tokenId] == address(0), "owner already exists");
        bytes32 messageHash = keccak256(abi.encodePacked(_tokenId, _value, _sn, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        emit ClaimLog(_sn, _tokenId, msg.sender);
        values[_tokenId] = _value;
        records[_sn] = _tokenId;
        owners[_tokenId] = msg.sender;
        ids[msg.sender] = _tokenId;
        return true;
    }

    function tokenURI(uint256 _tokenId) external view returns (string memory) {
        string memory json = Base64.encode(bytes(string(abi.encodePacked('{"name": "', symbol, ' #', _tokenId.toString(), '", "description": "', name, '", "image": "data:image/svg+xml;base64,', Base64.encode(bytes(image)), '"}'))));
        return string(abi.encodePacked('data:application/json;base64,', json));
    }

    function verifyMessage(
        bytes32 _messageHash,
        bytes calldata _signature
    ) public view returns (bool) {
        bytes32 hash;
        if(_domainHash == 0x0000000000000000000000000000000000000000000000000000000000000000) {
            hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
        } else {
            hash = keccak256(abi.encodePacked("\x19\x01", _domainHash, _messageHash));
        }
        return Signature.verify(hash, signer, _signature);
    }

    function getMultiUserAssets(address[] calldata _users) external view returns (uint[] memory result) {
        require(_users.length > 0, 'invalid parameters');
        result = new uint[](_users.length);
        for (uint i; i<_users.length; i++) {
            result[i] = ids[_users[i]];
        }
        return result;
    }
    
    function getRecords(bytes32[] calldata _sns) external view returns (uint[] memory result) {
        result = new uint[](_sns.length);
        for (uint i; i<_sns.length; i++) {
            result[i] = records[_sns[i]];
        }
    }

    function getOwners(uint[] calldata _tokenIds) external view returns (address[] memory result) {
        result = new address[](_tokenIds.length);
        for (uint i; i<_tokenIds.length; i++) {
            result[i] = owners[_tokenIds[i]];
        }
    }

    function ownerOf(uint256 _tokenId) public view returns (address) {
        return owners[_tokenId];
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == type(ISBT).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}