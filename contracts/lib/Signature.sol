// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import {Address} from "../utils/Address.sol";
import {IERC1271} from "../interfaces/IERC1271.sol";

library Signature {
    function recoverAddresses(bytes32 _hash, bytes memory _signatures) internal pure returns (address[] memory addresses) {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint count = _countSignatures(_signatures);
        addresses = new address[](count);
        for (uint i = 0; i < count; i++) {
            (v, r, s) = _parseSignature(_signatures, i);
            addresses[i] = ecrecover(_hash, v, r, s);
        }
    }
    
    function _parseSignature(bytes memory _signatures, uint _pos) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        uint offset = _pos * 65;
        assembly {
            r := mload(add(_signatures, add(32, offset)))
            s := mload(add(_signatures, add(64, offset)))
            v := and(mload(add(_signatures, add(65, offset))), 0xff)
        }

        if (v < 27) v += 27;

        require(v == 27 || v == 28);
    }
    
    function _countSignatures(bytes memory _signatures) internal pure returns (uint) {
        return _signatures.length % 65 == 0 ? _signatures.length / 65 : 0;
    }

    function verify(
        bytes32 _hash,
        address _signer,
        bytes memory _signature
    ) internal view returns (bool) {
        if (Address.isContract(_signer)) {
            // 0x1626ba7e is the interfaceId for signature contracts (see IERC1271)
            return IERC1271(_signer).isValidSignature(_hash, _signature) == 0x1626ba7e;
        } else {
            return recoverAddresses(_hash, _signature)[0] == _signer;
        }
    }
}