import { Wallet, BigNumber } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { NFT } from '../typechain/NFT'
import { expect } from './shared/expect'
import { computeDomainSeparator } from './shared/signature-helper'
import { nftFixture, NFTFixture } from './shared/fixtures'
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { LogConsole } from './shared/logconsol'
import { v4 } from 'uuid'
import { TypedDataDomain } from "@ethersproject/abstract-signer"

const createFixtureLoader = waffle.createFixtureLoader

let res: any
let sn: string
let owner: SignerWithAddress, signer: SignerWithAddress, feeTo:SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress;
let nft: NFT
let nftFix: NFTFixture
let expired = Math.floor(Date.now() / 1000) + 300;

const uuid = () => {
  return v4().replace(/-/g, '');
};


describe('NFT', async () => {
  describe('Base', async () => {
    let loadFixTure: ReturnType<typeof createFixtureLoader>;

  before('create fixture loader', async () => {
    [owner, signer, feeTo, user1, user2] = await (ethers as any).getSigners()
    LogConsole.info('owner, signer, feeTo, user1, user2:', owner.address, signer.address, feeTo.address, user1.address, user2.address)
    loadFixTure = createFixtureLoader([owner, signer, feeTo, user1, user2])
  })

  beforeEach('deploy instance', async () => {
    LogConsole.debug('beforeEach');
    nftFix = await loadFixTure(nftFixture);
    nft = nftFix.nft;

  })

  afterEach('clean case', async () => {
    LogConsole.debug('afterEach');
  })
    it('config', async () => {
      await expect(nft.changeOwner(owner.address)).to.be.revertedWith('no change');
      await expect(nft.setSigner(signer.address)).to.be.revertedWith('no change');
     
      await expect(nft.connect(user1).changeOwner(owner.address)).to.be.revertedWith('owner forbidden');
      await expect(nft.connect(user1).setSigner(signer.address)).to.be.revertedWith('dev forbidden');
      await expect(nft.connect(user1).setClaimLimit(2)).to.be.revertedWith('admin forbidden');

      await nft.changeOwner(signer.address);
      res = await nft.owner();
      expect(res).to.equal(signer.address);

      await nft.connect(signer).changeOwner(owner.address);
      res = await nft.owner();
      expect(res).to.equal(owner.address);

    });

    it('verifyMessage false', async () => {
      const param: any = await nftFix.signMintData(uuid(), expired);
      LogConsole.debug('signMintData param:', param);
      res = await nft.verifyMessage(param.sn, param.sign.compact);
      LogConsole.info('verifyMessage for eoa res:', res);
      expect(res).to.equal(false);
    }); 

    it('verifyMessage for eoa', async () => {
      let param: any = await nftFix.signMintData(uuid(), expired);
      LogConsole.info('signMintData param:', param);
      res = await nft.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage for eoa res:', res);
      expect(res).to.equal(true);

    }); 

    it('verifyMessage for ca', async () => {
      const domain: TypedDataDomain = {
        name: "NFT",
        version: "1",
        chainId: network.config.chainId ? network.config.chainId+'': "31337", // HRE
        verifyingContract: nft.address,
      };

      const domainHash = computeDomainSeparator(domain);
      await nft.setSignerContract(signer.address, domainHash);
      LogConsole.info('domainHash:', domainHash);

      const param: any = await nftFix.signMintData(uuid(), expired, domain);
      LogConsole.info('signMintData param:', param);
      res = await nft.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage for ca res:', res);
      expect(res).to.equal(true);
    }); 

    it('mint', async () => {
      let param: any = await nftFix.signMintData(uuid(), expired);
      LogConsole.info('signMintData param:', param);
      const tx = await nft.mint(param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('mint gasUsed:', receipt.gasUsed);
      LogConsole.debug('mint events:', receipt.events[0].args);

      expect(tx).to.emit(nft, 'MintLog')
      .withArgs(owner.address, receipt.events[0].args._tokenId, param.sn);

      res = await nft.getTokens(owner.address);
      LogConsole.info('tokenIds:', res);
      expect(res[0]).to.equal(BigNumber.from(1));

      await expect(nft.mint(param.sn, param.expired, param.sign.compact)).to.be.revertedWith('record already exists');

      param = await nftFix.signMintData(uuid(), 10000);
      await expect(nft.mint(param.sn, param.expired, param.sign.compact)).to.be.revertedWith('request is expired');

      param = await nftFix.signMintData(uuid(), expired);
      await expect(nft.mint(param.sn, param.expired+1, param.sign.compact)).to.be.revertedWith('invalid signature');

    }); 
  });
  
})