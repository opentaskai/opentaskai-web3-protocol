// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;


import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./ERC721/extensions/ERC721Enumerable.sol";
import "./Configable.sol";

contract NFT is ERC721Enumerable, Configable, Initializable {
    uint public maxTotalSupply = type(uint).max;
    string base_uri;
    string suffix;
    uint256 public claimLimit = 1;
    mapping(address => uint256) public claimCount;

        
    event MintTo(address indexed _user, uint indexed _tokenId);

    function initialize(string memory _name, string memory _symbol) external initializer 
    {
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

    function mintTo(address _to) external onlyAdmin
    {
        _claim(_to);
    }

    function mint() external
    {
        _claim(msg.sender);
    }

    function _claim(address _to) internal 
    {
        uint tokenId = totalSupply();
        ++tokenId;
        require(tokenId < maxTotalSupply, "claim is over");

        emit MintTo(_to, tokenId);
        _safeMint(_to, tokenId);

        claimCount[_to] += 1;
        _safeMint(_to, tokenId);
    }

    function kill() external onlyOwner
    {
        selfdestruct(payable(owner));
    }

    function setBaseTokenURI(string calldata _base_uri, string calldata _suffix) external onlyDev
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
}
