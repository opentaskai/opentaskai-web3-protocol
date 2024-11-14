import { Wallet, BigNumber, BigNumberish, utils } from 'ethers';
import { ethers, network, waffle } from 'hardhat';
import { ERC20Token } from '../typechain/ERC20Token';
import { Payment } from '../typechain/Payment';
import { PaymentRewardClaim } from '../typechain/PaymentRewardClaim';
import { expect } from './shared/expect';
import { computeMessageHash, makeMerkleTree } from './shared/signature-helper';
import { paymentRewardFixture, PaymentRewardFixture, uuid, hexToBytes32, formatLogArgs } from './shared/fixtures';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LogConsole } from './shared/logconsol';
import { expandWithDecimals, reduceWithDecimals } from './shared/numberDecimals';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const NONE = '0x0000000000000000000000000000000000000000000000000000000000000000';

let owner: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress;
let rewardClaim: PaymentRewardClaim;
let rewardFix: PaymentRewardFixture
let payment: Payment;
let usdt: ERC20Token;
let tokenAddr: string
let tokenName: string
let tokenInstance: ERC20Token

const createFixtureLoader = waffle.createFixtureLoader

function getLeaves(periodNumber: number, groupId: number, users: string[]) {
  const leaves = users.map((user, index) => {
    return computeMessageHash(['bytes32', 'uint256', 'uint256', 'uint256'], [user, periodNumber, groupId, expandWithDecimals(1, 18)]);
  })
  return { leaves: leaves, users: users }
}

async function getBalance(_user: SignerWithAddress) {
  if(!tokenAddr) throw new Error('please initialize token address');
  if(tokenAddr === ZERO_ADDRESS) {
    return await _user.getBalance();
  } else {
    if(!tokenInstance) throw new Error('please initialize token instance');
    return await tokenInstance.balanceOf(_user.address);
  }
}

async function getAccountBalance(account: string) {
  if(!tokenAddr) throw new Error('please initialize token address');
  const res = await payment.userAccounts(account, tokenAddr);
  // LogConsole.debug('getAccountBalance:', res);
  return res.available;
}

async function transfer(to: string, amount: BigNumberish) {
  if(!tokenAddr) throw new Error('please initialize token address');
  if(tokenAddr === ZERO_ADDRESS) {
    return await owner.sendTransaction({ to: to, value: amount });
  } else {
    return await tokenInstance.transfer(to, amount);
  }
}

const testCase = async (_tokenName: string = 'ETH') => {
  describe('RewardClaim token:'+_tokenName, async () => {
    let periodNumber = 0;
    let groupId = 0;
    let res: any;
    let loadFixTure: ReturnType<typeof createFixtureLoader>;
    let merkleLeaves: { leaves: any[], users: string[] };
    let merkleTree: { tree: any, root: string };

    const accounts: string[] = [];
    
    
    before('deploy RewardClaim contract', async () => {
      LogConsole.debug('before');
      [owner, user1, user2] = await (ethers as any).getSigners()
      LogConsole.info('owner, user1, user2:', owner.address, user1.address, user2.address)
      loadFixTure = createFixtureLoader([owner, user1, user2])
      for (let i=0; i<3; i++) {
        const account = hexToBytes32(uuid()); 
        LogConsole.debug('account:', i, account);
        accounts.push(account);
      }
    });

    beforeEach('deploy RewardClaim contract', async () => {   
      LogConsole.debug('beforeEach');
      rewardFix = await loadFixTure(paymentRewardFixture);
      rewardClaim = rewardFix.rewardClaim;
      usdt = rewardFix.usdt;
      payment = rewardFix.payment;
      periodNumber = 1;
      groupId = 1;
      tokenName = _tokenName;
      tokenAddr = ZERO_ADDRESS;
      if(tokenName === 'usdt') {
        tokenAddr = usdt.address;
        tokenInstance = usdt;
      }
      merkleLeaves = getLeaves(periodNumber, groupId, accounts);
      // LogConsole.debug('merkleLeaves:', merkleLeaves);
      merkleTree = await makeMerkleTree(merkleLeaves.leaves);
      // LogConsole.debug('merkleTree:', merkleTree);
      for (let i=0; i<accounts.length; i++) {
        const proof = merkleTree.tree.getHexProof(merkleLeaves.leaves[i]);
        LogConsole.debug('proof:', proof);
      }
      await rewardClaim.setPeriod(periodNumber, groupId, tokenAddr, merkleTree.root);
    });

    it('base', async () => {
      expect(await rewardClaim.config()).to.equal(rewardFix.config.address);
      const periodInfo = await rewardClaim.getPeriodInfo(periodNumber);
      LogConsole.debug('periodInfo:', periodInfo);
      expect(periodInfo).to.deep.equal([
        tokenAddr,
        BigNumber.from(0),
        BigNumber.from(0)
      ]);
      expect(await rewardClaim.checkPeriodMerkleRoot(periodNumber, groupId)).to.be.true;

      await rewardClaim.setPeriod(periodNumber, groupId, tokenAddr, NONE);
      expect(await rewardClaim.checkPeriodMerkleRoot(periodNumber, groupId)).to.be.false;
      await rewardClaim.batchSetPeriod([periodNumber], [groupId], [tokenAddr], [merkleTree.root]);

      for (let i=0; i<accounts.length; i++) {
        const balance = await getAccountBalance(accounts[i]);
        LogConsole.debug('balance:', balance);
        // expect(balance).to.equal(BigNumber.from(0));
      }
    })

    it('withdraw', async () => {
      await transfer(rewardClaim.address, expandWithDecimals(10, 18))

      await expect(rewardClaim.connect(user1).withdraw(user1.address, tokenAddr, expandWithDecimals(10, 18))).to.be.revertedWith('admin forbidden');
      await expect(rewardClaim.withdraw(user1.address, tokenAddr, expandWithDecimals(100_000, 18))).to.be.revertedWith('insufficient balance');

      const userBalance = await getBalance(owner)
      const balance = await rewardClaim.getBalance(tokenAddr)
      LogConsole.debug('before withdraw balance:', balance);
      
      const tx = await rewardClaim.withdraw(owner.address, tokenAddr, expandWithDecimals(10, 18));
      const receipt:any = await tx.wait()
      // LogConsole.info('withdraw receipt:', receipt);
      LogConsole.info('withdraw gasUsed:', receipt.gasUsed);
      const balance2 = await rewardClaim.getBalance(tokenAddr)
      LogConsole.debug('after withdraw balance:', balance2);
      const userBalance2 = await getBalance(owner)
      expect(balance2).to.equal(balance.sub(expandWithDecimals(10, 18)))
      if(tokenAddr !== ZERO_ADDRESS) {
        expect(userBalance2).to.equal(userBalance.add(expandWithDecimals(10, 18)))
      } else {
        expect(userBalance2).to.equal(userBalance.add(expandWithDecimals(10, 18).sub(receipt.gasUsed.mul(receipt.effectiveGasPrice))))
      }
    })

    it('test claimReward failed', async () => {
      const proof = merkleTree.tree.getHexProof(merkleLeaves.leaves[0]);
      await expect(rewardClaim.claimReward(accounts[0], periodNumber, groupId+1, expandWithDecimals(1, 18), proof)).to.be.revertedWith("group disabled");
      await expect(rewardClaim.claimReward(accounts[0], periodNumber, groupId, expandWithDecimals(200, 18), proof)).to.be.revertedWith("Invalid proof");
      
      if(tokenAddr !== ZERO_ADDRESS) {
        await rewardClaim.setPaymentAllowance(tokenAddr, 0);
        await expect(rewardClaim.claimReward(accounts[0], periodNumber, groupId, expandWithDecimals(1, 18), proof)).to.be.revertedWith('ERC20: insufficient allowance');
      }
    })

    it('test claimReward success', async () => {
      await transfer(rewardClaim.address, expandWithDecimals(10, 18))
      const balance = await rewardClaim.getBalance(tokenAddr)
      LogConsole.debug('before claim balance:', balance, reduceWithDecimals(balance, 18));

      const periodInfo = await rewardClaim.getPeriodInfo(periodNumber);
      LogConsole.debug('periodInfo:', periodInfo);
      expect(periodInfo).to.deep.equal([
        tokenAddr,
        BigNumber.from(0),
        BigNumber.from(0)
      ]);

      for (let i=0; i<merkleLeaves.users.length; i++) {
        res = await rewardClaim.hasClaimed(periodNumber, merkleLeaves.users[i]);
        LogConsole.debug('before claim hasClaimed:', res); 
        expect(res).to.be.false;
        const proof = merkleTree.tree.getHexProof(merkleLeaves.leaves[i]);
        // LogConsole.debug('proof:', proof);
        const beforeBalance = await getAccountBalance(merkleLeaves.users[i]);  
        const beforePaymentBalance = await payment.getBalance(tokenAddr);
        const tx = await rewardClaim.claimReward(merkleLeaves.users[i], periodNumber, groupId, expandWithDecimals(1, 18), proof);
        const receipt:any = await tx.wait()
        LogConsole.info('claimReward gasUsed:', receipt.gasUsed);
        // LogConsole.debug('claimReward events:', receipt.events);
        expect(tx).to.emit(rewardClaim, 'RewardClaimed')
        .withArgs(merkleLeaves.users[i], periodNumber, expandWithDecimals(1, 18), tokenAddr, owner.address);
        
        const afterBalance = await getAccountBalance(merkleLeaves.users[i]);
        LogConsole.debug('after claim balance:', afterBalance, merkleLeaves.users[i]);
        const afterPaymentBalance = await payment.getBalance(tokenAddr);  
        LogConsole.debug('after claim payment balance:', afterPaymentBalance);
        res = await rewardClaim.hasClaimed(periodNumber, merkleLeaves.users[i]);
        LogConsole.debug('after claim hasClaimed:', res); 
        expect(res).to.be.true;
        expect(afterBalance).to.equal(beforeBalance.add(expandWithDecimals(1, 18)))
        expect(afterPaymentBalance).to.equal(beforePaymentBalance.add(expandWithDecimals(1, 18)))

        const balance2 = await rewardClaim.getBalance(tokenAddr)
        LogConsole.debug('after claim balance:', balance2);

        await expect(rewardClaim.claimReward(merkleLeaves.users[i], periodNumber, groupId, expandWithDecimals(1, 18), proof)).to.be.revertedWith("Reward already claimed");
      }

      const periodInfo2 = await rewardClaim.getPeriodInfo(periodNumber);
      LogConsole.debug('periodInfo2:', periodInfo2);
      expect(periodInfo2).to.deep.equal([
        tokenAddr,
        BigNumber.from(merkleLeaves.users.length),
        expandWithDecimals(merkleLeaves.users.length, 18)
      ]);
    });

  });
};

// testCase();
testCase('usdt');