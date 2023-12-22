// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;


import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./ERC721/extensions/ERC721Enumerable.sol";
import "./Configable.sol";
import "./lib/Signature.sol";

contract NFT is ERC721Enumerable, Configable, Initializable {
    uint id;
    uint public maxTotalSupply;
    string base_uri;
    string suffix;
    bytes32 _domainHash;
    address public signer;
    uint256 public claimLimit;
    mapping(address => uint256) public claimCount;
    // sn, tokenId
    mapping(bytes32 => uint256) public records;
    // tokenId, sn
    mapping(uint256 => bytes32) public record2s;
        
    event MintLog(address indexed _user, uint indexed _tokenId, bytes32 indexed _sn);

    function initialize(string memory _name, string memory _symbol) external initializer 
    {
        uint _id;
        assembly {
            _id := chainid()
        }
        id = _id;
        maxTotalSupply = type(uint).max;
        claimLimit = 1;
        owner = msg.sender;
        name = _name;
        symbol = _symbol;
    }

    function tokenURI(uint256 _tokenId) public view override returns (string memory)
    {
        require(_exists(_tokenId), "invalid tokenId");
        return string(abi.encodePacked(base_uri, Strings.toString(_tokenId), suffix));
    }

    function getTokens(address _account) external view returns (uint[] memory)
    {
        uint count = balanceOf(_account);
        uint[] memory tokens = new uint[](count);
        for (uint i = 0; i < count; i++) {
            uint token_id = tokenOfOwnerByIndex(_account, i);
            tokens[i] = token_id;
        }

        return tokens;
    }

    function exists(uint _tokenId) external view returns(bool)
    {
        return _exists(_tokenId);
    }

    function mintTo(address _to, bytes32 _sn) external onlyAdmin
    {
        _claim(_to, _sn);
    }

    function mint(bytes32 _sn, uint _expired, bytes calldata _signature) external
    {
        require(_expired > block.timestamp, "request is expired");
        bytes32 messageHash = keccak256(abi.encodePacked(_sn, _expired, id, address(this)));
        require(verifyMessage(messageHash, _signature), "invalid signature");
        _claim(msg.sender, _sn);
    }

    function _claim(address _to, bytes32 _sn) internal 
    {
        require(records[_sn] == 0, "record already exists");
        require(claimCount[_to] < claimLimit, "over claim limit");

        uint tokenId = totalSupply();
        tokenId += 1;
        require(tokenId < maxTotalSupply, "claim is over");
 
        emit MintLog(_to, tokenId, _sn);

        records[_sn] = tokenId;
        record2s[tokenId] = _sn;
        claimCount[_to] += 1;
        _safeMint(_to, tokenId);
    }

    function setURI(string calldata _base_uri, string calldata _suffix) external onlyDev
    {
        base_uri = _base_uri;
        suffix = _suffix;
    }

    function setMaxTotalSupply(uint256 _value) external onlyAdmin {
        require(maxTotalSupply < _value, 'must be great maxTotalSupply');
        maxTotalSupply = _value;
    }

    function setClaimLimit(uint256 _value) external onlyAdmin {
        require(claimLimit != _value, 'no change');
        claimLimit = _value;
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

    function changeNameAndSymbol(string memory _name, string memory _symbol) external onlyDev {
        name = _name;
        symbol = _symbol;
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
}
