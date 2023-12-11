// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "../ERC721/IERC165.sol";

/**
 * @dev Required interface of a SBT compliant contract.
 */
interface ISBT is IERC165 {
    /**
     * @dev Returns the owner of the `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function ownerOf(uint256 tokenId) external view returns (address owner);

}
