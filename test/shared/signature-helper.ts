import { BigNumber, utils, Wallet } from "ethers";
/* eslint-disable node/no-extraneous-import */
import { TypedDataDomain } from "@ethersproject/abstract-signer";
/* eslint-disable node/no-extraneous-import */
import { Signature } from "@ethersproject/bytes";
/* eslint-disable node/no-extraneous-import */
import { _TypedDataEncoder } from "@ethersproject/hash";
const { defaultAbiCoder, keccak256, solidityPack } = utils;
import { ethers, network } from 'hardhat';
import { findPrivateKey } from "./hardhat-keys";
import { MerkleTree } from 'merkletreejs'
import { LogConsole } from './logconsol'

export const eth_sign = async function (
  signer: string,
  types: string[],
  values: (string | boolean | BigNumber)[],
): Promise<any> {
  let message = ethers.utils.solidityKeccak256(types, values)
  return await network.provider.send('eth_sign', [signer, message])
}

export const eth_signTypedData_v4 = async (
  signer: string,
  data: Record<string, any>
): Promise<any> => {
  return await network.provider.send('eth_signTypedData_v4', [signer, data])
};

export const signData = async (
  signer: string,
  types: string[],
  values: (string | boolean | number | BigNumber)[],
  domain?: TypedDataDomain
): Promise<Signature> => {
  // https://docs.ethers.io/v5/api/utils/abi/coder/#AbiCoder--methods
  const hash = computeMessageHash(types, values);
  return signMessageHash(signer, hash, domain);
};

export const signMessageHash = async (
  signer: string,
  hash: string,
  domain?: TypedDataDomain
): Promise<Signature> => {

  if (domain) {
    return await signTypedMessageHash(signer, hash, domain);
  }

  // https://docs.ethers.io/v5/api/utils/abi/coder/#AbiCoder--methods
  // LogConsole.debug('signData hash', hash);
  // Compute the digest
  const digest = keccak256(
    solidityPack(["string", "bytes32"], ["\x19Ethereum Signed Message:\n32", hash])
  );
  // LogConsole.debug('signData digest', digest);
  const adjustedSigner = new Wallet(findPrivateKey(signer));
  // LogConsole.debug('signer address:', adjustedSigner.address);
  const res:any = { ...adjustedSigner._signingKey().signDigest(digest) };
  res.compact = res.r + res.s.substring(2) + ethers.utils.hexValue(res.v).substring(2);
  res.messageHash = hash;
  res.domainHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  return res;
};

export const signTypedData = async (
  signer: string,
  types: string[],
  values: (string | boolean | number | BigNumber)[],
  domain: TypedDataDomain
): Promise<Signature> => {
  // https://docs.ethers.io/v5/api/utils/abi/coder/#AbiCoder--methods
  const hash = computeMessageHash(types, values);
  return signTypedMessageHash(signer, hash, domain);
};


export const signTypedMessageHash = async (
  signer: string,
  hash: string,
  domain: TypedDataDomain
): Promise<Signature> => {
  const domainSeparator = _TypedDataEncoder.hashDomain(domain);

  // https://docs.ethers.io/v5/api/utils/abi/coder/#AbiCoder--methods

  // Compute the digest
  const digest = keccak256(
    solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", domainSeparator, hash])
  );
  // LogConsole.debug('signTypedData digest', digest);
  const adjustedSigner = new Wallet(findPrivateKey(signer));
  // LogConsole.debug('signer address:', adjustedSigner.address);
  const res:any = { ...adjustedSigner._signingKey().signDigest(digest) };
  res.compact = res.r + res.s.substring(2) + ethers.utils.hexValue(res.v).substring(2);
  res.messageHash = hash
  res.domainHash = domainSeparator
  return res;
};

export const computeDomainSeparator = (domain: TypedDataDomain): string => {
  return _TypedDataEncoder.hashDomain(domain);
};

export const computeMessageHash = (types: string[], values: (string | boolean | number | BigNumber)[]): string => {
  return keccak256(solidityPack(types, values));
};

export const makeMerkleTree = async function (leafs: any[]): Promise<{ tree: MerkleTree, root: string }> {
    let tree = new MerkleTree(leafs, ethers.utils.keccak256, { sortPairs: true })
    let rootHash = tree.getHexRoot()
    return { tree: tree, root: rootHash }
}