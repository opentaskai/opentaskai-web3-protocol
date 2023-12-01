import { Wallet, BigNumber } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { ERC20Token } from '../typechain/ERC20Token'
import { Payment } from '../typechain/Payment'
import { Config } from '../typechain/Config'
import { expect } from './shared/expect'
import { computeDomainSeparator } from './shared/signature-helper'
import { paymentFixture, PaymentFixture, TradeData } from './shared/fixtures'
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { LogConsole } from './shared/logconsol'
import { v4 } from 'uuid'
import { TypedDataDomain } from "@ethersproject/abstract-signer"
import { expandWithDecimals ,reduceWithDecimals } from './shared/numberDecimals'

const createFixtureLoader = waffle.createFixtureLoader
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface TransferData {
  token: string;
  from: string;
  to: string;
  available: (string | number | BigNumber);
  frozen: (string | number | BigNumber);
  amount: (string | number | BigNumber); //to 'address to'
  fee: (string | number | BigNumber); // to 'address feeTo'
}

let res: any
let sn: string
let owner: SignerWithAddress, signer: SignerWithAddress, feeTo:SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress;
let usdt: ERC20Token
let usdc: ERC20Token
let payment: Payment
let payFix: PaymentFixture
let tokenInstance: ERC20Token
let tokenAddr: string
let tokenName: string

const uuid = () => {
  return v4().replace(/-/g, '');
};

function getPayOption(value:(string | number | BigNumber), tokenAddr?: string) {
  if (!tokenAddr || tokenAddr === ZERO_ADDRESS) {
    return {value}
  }
  return {}
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

const testCase = async (_tokenName:string = 'ETH') => {
  describe('Deal for '+ _tokenName, async () => {
    let loadFixTure: ReturnType<typeof createFixtureLoader>;

  before('create fixture loader', async () => {
    [owner, signer, feeTo, user1, user2] = await (ethers as any).getSigners()
    LogConsole.info('owner, signer, feeTo, user1, user2:', owner.address, signer.address, feeTo.address, user1.address, user2.address)
    loadFixTure = createFixtureLoader([owner, signer, feeTo, user1, user2])
  })

  beforeEach('deploy instance', async () => {
    LogConsole.debug('beforeEach');
    payFix = await loadFixTure(paymentFixture);
    usdt = payFix.usdt;
    usdc = payFix.usdc;
    payment = payFix.payment;

    tokenAddr = ZERO_ADDRESS;
    if(tokenName === 'usdt') {
      tokenAddr = usdt.address;
      tokenInstance = usdt;
    } else if(tokenName === 'usdc') {
      tokenAddr = usdc.address;
      tokenInstance = usdc;
    }
  })

  afterEach('clean case', async () => {
    LogConsole.debug('afterEach');
    LogConsole.debug('tokenName:', tokenName);
    LogConsole.debug('tokenAddr:', tokenAddr);
  })
    tokenName = _tokenName;
    const depositAmount = expandWithDecimals(6);
    const frozenAmount = expandWithDecimals(2);
    const availableAmount = depositAmount.sub(frozenAmount);

    it('deposit', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      if(tokenAddr === ZERO_ADDRESS) {
        await expect(payment.deposit(user1.address, tokenAddr, depositAmount, getPayOption(1, tokenAddr))).to.be.revertedWith('invalid value');
      }

      let tx = await payment.deposit(user1.address, tokenAddr, depositAmount, getPayOption(depositAmount, tokenAddr));
      const receipt:any = await tx.wait()
      LogConsole.info('deposit gasUsed:', receipt.gasUsed);
      LogConsole.debug('deposit events:', receipt.events[0].args);
      expect(tx).to.emit(payment, 'DepositLog')
      .withArgs(user1.address, tokenAddr, depositAmount, owner.address)
      
      let ownerBalance2 = await getBalance(owner);
      res = ownerBalance.sub(ownerBalance2)
      LogConsole.debug('owner balance:', res);
      if(tokenAddr === ZERO_ADDRESS) {
        expect(res).to.gt(depositAmount);
      } else {
        expect(res).to.equal(depositAmount);
      }
      
      let userBalance2 = await getBalance(user1);
      expect(userBalance2).to.equal(userBalance);

      let userAccount = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount);
      expect(userAccount.frozen).to.equal(BigNumber.from(0));

      await payment.deposit(user1.address, tokenAddr, depositAmount, {
        value: depositAmount
      });
      
      userAccount = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount.mul(2));
      expect(userAccount.frozen).to.equal(BigNumber.from(0));
    });

    it('depositAndFreeze', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      sn = uuid();
      const param: any = await payFix.signDepositAndFreezeData(user1.address, tokenAddr, availableAmount, frozenAmount, sn);
      LogConsole.debug('signDepositAndFreezeData param:', param);

      await expect(payment.depositAndFreeze(param.to, param.token, param.available.add(1), param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr))).to.be.revertedWith('invalid signature');
      
      if(tokenAddr === ZERO_ADDRESS) {
        await expect(payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(1, tokenAddr))).to.be.revertedWith('invalid value');
      }

      let tx = await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));
      const receipt:any = await tx.wait()
      LogConsole.info('depositAndFreeze gasUsed:', receipt.gasUsed);
      LogConsole.debug('depositAndFreeze events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'DepositDetailLog')
      .withArgs(param.sn, param.token, owner.address, param.to, param.available, param.frozen)
      
      let ownerBalance2 = await getBalance(owner);
      res = ownerBalance.sub(ownerBalance2)
      LogConsole.debug('owner balance:', res);
      if(tokenAddr === ZERO_ADDRESS) {
        expect(res).to.gt(depositAmount);
      } else {
        expect(res).to.equal(depositAmount);
      }
      let userBalance2 = await getBalance(user1);
      expect(userBalance2).to.equal(userBalance);

      let userAccount = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(availableAmount)
      expect(userAccount.frozen).to.equal(frozenAmount);
      
      await expect(payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr))).to.be.revertedWith('record already exists');

    });

    it('withdrawWithDetail', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      
      let param: any = await payFix.signDepositAndFreezeData(user1.address, tokenAddr, availableAmount, frozenAmount, uuid());
      LogConsole.debug('signDepositAndFreezeData param:', param);
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));
      
      param = await payFix.signWithdrawWithDetail(user1.address, tokenAddr, availableAmount, frozenAmount, uuid());
      LogConsole.debug('signWithdrawWithDetail param:', param);

      await expect(payment.connect(user1).withdrawWithDetail(payment.address, param.token, param.available, param.frozen, param.sn, param.sign.compact)).to.be.revertedWith('invalid signature');

      let tx = await payment.connect(user1).withdrawWithDetail(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('withdrawWithDetail gasUsed:', receipt.gasUsed);
      LogConsole.debug('withdrawWithDetail events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'WithdrawDetailLog')
      .withArgs(param.sn, param.token, user1.address, param.to, param.available, param.frozen)

      let userBalance2 = await getBalance(user1);
      LogConsole.debug('user balance2:', userBalance2);
      if(tokenAddr === ZERO_ADDRESS) {
        expect(userBalance2).to.gt(userBalance);
      } else {
        expect(userBalance2).to.equal(userBalance.add(param.available).add(param.frozen));
      }
      
      await expect(payment.connect(user1).withdrawWithDetail(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact)).to.be.revertedWith('record already exists');
      
    });

    it('freeze', async () => {
      await payment.deposit(user1.address, tokenAddr, depositAmount, getPayOption(depositAmount, tokenAddr));

      const param: any = await payFix.signFreezeData(tokenAddr, frozenAmount, uuid());
      LogConsole.debug('signFreezeData param:', param);

      await expect(payment.connect(user1).freeze(param.token, param.amount.add(1), param.sn, param.sign.compact)).to.be.revertedWith('invalid signature');

      await expect(payment.freeze(param.token, param.amount, param.sn, param.sign.compact)).to.be.revertedWith('insufficient available');

      let tx = await payment.connect(user1).freeze(param.token, param.amount, param.sn, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('freeze gasUsed:', receipt.gasUsed);
      LogConsole.debug('freeze events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'FreezeLog')
      .withArgs(param.sn, param.token, param.amount, user1.address);


      let userAccount = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount.sub(frozenAmount));
      expect(userAccount.frozen).to.equal(frozenAmount);

      await expect(payment.freeze(param.token, param.amount, param.sn, param.sign.compact)).to.be.revertedWith('record already exists');

    });

    it('unfreeze', async () => {
      await payment.deposit(user1.address, tokenAddr, depositAmount, getPayOption(depositAmount, tokenAddr));

      let param: any = await payFix.signFreezeData(tokenAddr, frozenAmount, uuid());
      // LogConsole.debug('signFreezeData param:', param);
      await payment.connect(user1).freeze(param.token, param.amount, param.sn, param.sign.compact);

      param = await payFix.signFreezeData(tokenAddr, frozenAmount, uuid());

      await expect(payment.connect(user1).unfreeze(param.token, param.amount.add(1), param.sn, param.sign.compact)).to.be.revertedWith('invalid signature');

      await expect(payment.unfreeze(param.token, param.amount, param.sn, param.sign.compact)).to.be.revertedWith('insufficient frozen');

      let tx = await payment.connect(user1).unfreeze(param.token, param.amount, param.sn, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('unfreeze gasUsed:', receipt.gasUsed);
      LogConsole.debug('unfreeze events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'UnfreezeLog')
      .withArgs(param.sn, param.token, param.amount, user1.address);

      let userAccount = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount);
      expect(userAccount.frozen).to.equal(BigNumber.from(0));

      await expect(payment.unfreeze(param.token, param.amount, param.sn, param.sign.compact)).to.be.revertedWith('record already exists');

    });

    it('inner transfer', async () => {
      const availableTradeAmount = expandWithDecimals(2);
      const frozenTradeAmount = expandWithDecimals(1);
      
      // deposit and freeze for user1
      let param: any = await payFix.signDepositAndFreezeData(user1.address, tokenAddr, availableAmount, frozenAmount, uuid());
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // deposit and freeze for user2
      param = await payFix.signDepositAndFreezeData(user2.address, tokenAddr, availableAmount, frozenAmount, uuid());
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // preparing transfer data 
      param = await payFix.signTransferData(tokenAddr, user1.address, user2.address, availableTradeAmount, frozenTradeAmount, availableTradeAmount, frozenTradeAmount, uuid());
      LogConsole.debug('signTransferData:', param);
      const transferData = { ...param };
      delete transferData.sn;
      delete transferData.sign;
      LogConsole.debug('transferData:', transferData);

      // test reverted with reason string 'invalid signature'
      let invalidDealData = { ... transferData };
      invalidDealData.token = payment.address;
      await expect(payment.transfer(false, invalidDealData, param.sn, param.sign.compact)).to.be.revertedWith('invalid signature');
      
      // test reverted with reason string 'invalid deal'
      invalidDealData = { ... transferData };
      invalidDealData.available = invalidDealData.available.add(1);
      await expect(payment.transfer(false, invalidDealData, param.sn, param.sign.compact)).to.be.revertedWith('invalid deal');

      let userAccount = await payment.userAccounts(user1.address, param.token);
      LogConsole.debug('userAccount:', userAccount);

      // test reverted with reason string 'insufficient available'
      await payment.connect(user1).withdraw(user1.address, param.token, userAccount.available);
      await expect(payment.transfer(false, transferData, param.sn, param.sign.compact)).to.be.revertedWith('insufficient available');
      await payment.deposit(user1.address, tokenAddr, userAccount.available, getPayOption(userAccount.available, tokenAddr));
      
      // test reverted with reason string 'insufficient frozen'
      const freezeParam = await payFix.signFreezeData(tokenAddr, userAccount.frozen, uuid());
      await payment.connect(user1).unfreeze(freezeParam.token, freezeParam.amount, freezeParam.sn, freezeParam.sign.compact)
      await expect(payment.transfer(false, transferData, param.sn, param.sign.compact)).to.be.revertedWith('insufficient frozen');
      const unfreezeParam: any = await payFix.signFreezeData(tokenAddr, userAccount.frozen, uuid());
      await payment.connect(user1).freeze(unfreezeParam.token, unfreezeParam.amount, unfreezeParam.sn, unfreezeParam.sign.compact);
      
    
      const user1AccountBefore = await payment.userAccounts(user1.address, param.token);
      LogConsole.debug('user1AccountBefore:', user1AccountBefore);

      const user2AccountBefore = await payment.userAccounts(user2.address, param.token);
      LogConsole.debug('user2AccountBefore:', user2AccountBefore);

      const feeToAccountBefore = await payment.userAccounts(feeTo.address, param.token);
      LogConsole.debug('feeToAccountBefore:', feeToAccountBefore);

      const paymentBalanceBefore = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceBefore:', paymentBalanceBefore);
      
      // test inner transfer
      let tx = await payment.transfer(false, transferData, param.sn, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('transfer gasUsed:', receipt.gasUsed);
      LogConsole.debug('transfer events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'TransferLog')
      .withArgs(param.sn, param.token, param.from, param.to, param.available, param.frozen, param.amount, param.fee);

      const user1AccountAfter = await payment.userAccounts(user1.address, param.token);
      LogConsole.debug('user1AccountAfter:', user1AccountAfter);
      const user2AccountAfter = await payment.userAccounts(user2.address, param.token);
      LogConsole.debug('user2AccountAfter:', user2AccountAfter);
      const feeToAccountAfter = await payment.userAccounts(feeTo.address, param.token);
      LogConsole.debug('feeToAccountAfter:', feeToAccountAfter);
      const paymentBalanceAfter = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceAfter:', paymentBalanceAfter);

      expect(user1AccountAfter.available).to.equal(user1AccountBefore.available.sub(availableTradeAmount));
      expect(user1AccountAfter.frozen).to.equal(user1AccountBefore.frozen.sub(frozenTradeAmount));
      expect(user2AccountAfter.available).to.equal(user2AccountBefore.available.add(availableTradeAmount));
      expect(user2AccountAfter.frozen).to.equal(user2AccountBefore.frozen);
      expect(feeToAccountAfter.available).to.equal(feeToAccountBefore.available.add(frozenTradeAmount));
      expect(feeToAccountAfter.frozen).to.equal(feeToAccountBefore.frozen);
      expect(paymentBalanceBefore).to.equal(paymentBalanceAfter);

    });

    it('transfer and withdraw', async () => {
      const availableTradeAmount = expandWithDecimals(2);
      const frozenTradeAmount = expandWithDecimals(1);
      
      // deposit and freeze for user1
      let param: any = await payFix.signDepositAndFreezeData(user1.address, tokenAddr, availableAmount, frozenAmount, uuid());
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // deposit and freeze for user2
      param = await payFix.signDepositAndFreezeData(user2.address, tokenAddr, availableAmount, frozenAmount, uuid());
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // preparing transfer data 
      param = await payFix.signTransferData(tokenAddr, user1.address, user2.address, availableTradeAmount, frozenTradeAmount, availableTradeAmount, frozenTradeAmount, uuid());
      LogConsole.debug('signTransferData:', param);
      const transferData = { ...param };
      delete transferData.sn;
      delete transferData.sign;
      LogConsole.debug('transferData:', transferData);

    
      const user1AccountBefore = await payment.userAccounts(user1.address, param.token);
      LogConsole.debug('user1AccountBefore:', user1AccountBefore);

      const user2AccountBefore = await payment.userAccounts(user2.address, param.token);
      LogConsole.debug('user2AccountBefore:', user2AccountBefore);

      const feeToAccountBefore = await payment.userAccounts(feeTo.address, param.token);
      LogConsole.debug('feeToAccountBefore:', feeToAccountBefore);

      const paymentBalanceBefore = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceBefore:', paymentBalanceBefore);
      
      // test transfer an withdraw
      let tx = await payment.transfer(true, transferData, param.sn, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('transfer gasUsed:', receipt.gasUsed);
      LogConsole.debug('transfer events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'TransferLog')
      .withArgs(param.sn, param.token, param.from, param.to, param.available, param.frozen, param.amount, param.fee);

      const user1AccountAfter = await payment.userAccounts(user1.address, param.token);
      LogConsole.debug('user1AccountAfter:', user1AccountAfter);
      const user2AccountAfter = await payment.userAccounts(user2.address, param.token);
      LogConsole.debug('user2AccountAfter:', user2AccountAfter);
      const feeToAccountAfter = await payment.userAccounts(feeTo.address, param.token);
      LogConsole.debug('feeToAccountAfter:', feeToAccountAfter);
      const paymentBalanceAfter = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceAfter:', paymentBalanceAfter);

      expect(user1AccountAfter.available).to.equal(user1AccountBefore.available.sub(availableTradeAmount));
      expect(user1AccountAfter.frozen).to.equal(user1AccountBefore.frozen.sub(frozenTradeAmount));
      expect(user2AccountAfter.available).to.equal(user2AccountBefore.available);
      expect(user2AccountAfter.frozen).to.equal(user2AccountBefore.frozen);
      expect(feeToAccountAfter.available).to.equal(feeToAccountBefore.available);
      expect(feeToAccountAfter.frozen).to.equal(feeToAccountBefore.frozen);
      expect(paymentBalanceAfter).to.equal(paymentBalanceBefore.sub(availableTradeAmount).sub(frozenTradeAmount));
      
    });

    it('cancel', async () => {
      // deposit and freeze for user1
      let param: any = await payFix.signDepositAndFreezeData(user1.address, tokenAddr, availableAmount, frozenAmount, uuid());
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // deposit and freeze for user2
      param = await payFix.signDepositAndFreezeData(user2.address, tokenAddr, availableAmount, frozenAmount, uuid());
      await payment.depositAndFreeze(param.to, param.token, param.available, param.frozen, param.sn, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // preparing cancel data 
      const userA: TradeData = {
        user: user1.address,
        token: tokenAddr,
        amount: frozenAmount,
        fee: frozenAmount.div(2)
      }

      const userB: TradeData = {
        user: user2.address,
        token: tokenAddr,
        amount: frozenAmount,
        fee: frozenAmount.div(2)
      }

      param = await payFix.signCancelData(userA, userB, uuid());
      LogConsole.debug('signCancelData:', param);

      // test reverted with reason string 'invalid signature'
      await expect(payment.cancel(param.userA, param.userA, param.sn, param.sign.compact)).to.be.revertedWith('invalid signature');
      
      // test reverted with reason string 'insufficient frozen'
      let freezeParam: any = await payFix.signFreezeData(tokenAddr, frozenAmount, uuid());
      await payment.connect(user1).unfreeze(freezeParam.token, freezeParam.amount, freezeParam.sn, freezeParam.sign.compact);
      await expect(payment.cancel(param.userA, param.userB, param.sn, param.sign.compact)).to.be.revertedWith('insufficient frozen');
      freezeParam = await payFix.signFreezeData(tokenAddr, frozenAmount, uuid());
      await payment.connect(user1).freeze(freezeParam.token, freezeParam.amount, freezeParam.sn, freezeParam.sign.compact);
      
      const user1AccountBefore = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('user1AccountBefore:', user1AccountBefore);

      const user2AccountBefore = await payment.userAccounts(user2.address, tokenAddr);
      LogConsole.debug('user2AccountBefore:', user2AccountBefore);

      const feeToAccountBefore = await payment.userAccounts(feeTo.address, tokenAddr);
      LogConsole.debug('feeToAccountBefore:', feeToAccountBefore);

      const paymentBalanceBefore = await payment.getBalance(tokenAddr)
      LogConsole.debug('paymentBalanceBefore:', paymentBalanceBefore);
      
      // test cancel
      let tx = await payment.cancel(param.userA, param.userB, param.sn, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('cancel gasUsed:', receipt.gasUsed);
      LogConsole.debug('cancel events:', receipt.events[0].args);

      // expect(tx).to.emit(payment, 'CancelLog')
      // .withArgs(param.sn, param.userA, param.userB);

      const user1AccountAfter = await payment.userAccounts(user1.address, tokenAddr);
      LogConsole.debug('user1AccountAfter:', user1AccountAfter);
      const user2AccountAfter = await payment.userAccounts(user2.address, tokenAddr);
      LogConsole.debug('user2AccountAfter:', user2AccountAfter);
      const feeToAccountAfter = await payment.userAccounts(feeTo.address, tokenAddr);
      LogConsole.debug('feeToAccountAfter:', feeToAccountAfter);
      const paymentBalanceAfter = await payment.getBalance(tokenAddr)
      LogConsole.debug('paymentBalanceAfter:', paymentBalanceAfter);

      expect(user1AccountAfter.available).to.equal(user1AccountBefore.available.add(frozenAmount.div(2)));
      expect(user1AccountAfter.frozen).to.equal(user1AccountBefore.frozen.sub(frozenAmount));
      expect(user2AccountAfter.available).to.equal(user2AccountBefore.available.add(frozenAmount.div(2)));
      expect(user2AccountAfter.frozen).to.equal(user2AccountBefore.frozen.sub(frozenAmount));
      expect(feeToAccountAfter.available).to.equal(feeToAccountBefore.available.add(frozenAmount));
      expect(feeToAccountAfter.frozen).to.equal(feeToAccountBefore.frozen);
      expect(paymentBalanceBefore).to.equal(paymentBalanceAfter);

      await expect(payment.cancel(param.userA, param.userB, param.sn, param.sign.compact)).to.be.revertedWith('record already exists');
          
      const records = await payment.getRecords([param.sn, freezeParam.sn])
      LogConsole.debug('records:', records);
      expect(records[0]).to.equal(owner.address)
      expect(records[1]).to.equal(user1.address)
    });
     
  });
}

describe('Payment', async () => {
  describe('Base', async () => {
    let loadFixTure: ReturnType<typeof createFixtureLoader>;

  before('create fixture loader', async () => {
    [owner, signer, feeTo, user1, user2] = await (ethers as any).getSigners()
    LogConsole.info('owner, signer, feeTo, user1, user2:', owner.address, signer.address, feeTo.address, user1.address, user2.address)
    loadFixTure = createFixtureLoader([owner, signer, feeTo, user1, user2])
  })

  beforeEach('deploy instance', async () => {
    LogConsole.debug('beforeEach');
    payFix = await loadFixTure(paymentFixture);
    usdt = payFix.usdt;
    usdc = payFix.usdc;
    payment = payFix.payment;

    tokenAddr = ZERO_ADDRESS;
    if(tokenName === 'usdt') {
      tokenAddr = usdt.address;
      tokenInstance = usdt;
    } else if(tokenName === 'usdc') {
      tokenAddr = usdc.address;
      tokenInstance = usdc;
    }
  })

  afterEach('clean case', async () => {
    LogConsole.debug('afterEach');
    LogConsole.debug('tokenName:', tokenName);
    LogConsole.debug('tokenAddr:', tokenAddr);
  })
    it('config', async () => {
      await expect(payment.changeOwner(owner.address)).to.be.revertedWith('no change');
      await expect(payment.setSigner(signer.address)).to.be.revertedWith('no change');
      await expect(payment.setFeeTo(feeTo.address)).to.be.revertedWith('no change');

      await expect(payment.connect(user1).changeOwner(owner.address)).to.be.revertedWith('owner forbidden');
      await expect(payment.connect(user1).setSigner(signer.address)).to.be.revertedWith('dev forbidden');
      await expect(payment.connect(user1).setFeeTo(feeTo.address)).to.be.revertedWith('admin forbidden');
      await expect(payment.connect(user1).setEnabled(false)).to.be.revertedWith('dev forbidden');

      await payment.changeOwner(signer.address);
      res = await payment.owner();
      expect(res).to.equal(signer.address);

      await payment.connect(signer).changeOwner(owner.address);
      res = await payment.owner();
      expect(res).to.equal(owner.address);

      await payment.setFeeTo(owner.address);
      res = await payment.feeTo();
      expect(res).to.equal(owner.address);

    });

    it('verifyMessage false', async () => {
      const param: any = await payFix.signFreezeData(usdt.address, expandWithDecimals(1000).toString(), uuid());
      LogConsole.debug('signFreezeData param:', param);
      res = await payment.verifyMessage(param.sn, param.sign.compact);
      LogConsole.info('verifyMessage for eoa res:', res);
      expect(res).to.equal(false);
    }); 

    it('verifyMessage for eoa', async () => {
      let param: any = await payFix.signFreezeData(usdt.address, expandWithDecimals(1000).toString(), uuid());
      LogConsole.info('signFreezeData param:', param);
      res = await payment.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage for eoa res:', res);
      expect(res).to.equal(true);

      const availableTradeAmount = expandWithDecimals(2);
      const frozenTradeAmount = expandWithDecimals(1);
      param = await payFix.signTransferData(ZERO_ADDRESS, user1.address, user2.address, availableTradeAmount, frozenTradeAmount, availableTradeAmount, frozenTradeAmount, uuid());
      LogConsole.debug('signTransferData:', param);
      res = await payment.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage2 for eoa res:', res);
    }); 

    it('verifyMessage for ca', async () => {
      const domain: TypedDataDomain = {
        name: "Payment",
        version: "1",
        chainId: network.config.chainId ? network.config.chainId+'': "31337", // HRE
        verifyingContract: payment.address,
      };

      const domainHash = computeDomainSeparator(domain);
      await payment.setSignerContract(signer.address, domainHash);
      LogConsole.info('domainHash:', domainHash);

      const param: any = await payFix.signFreezeData(usdt.address, expandWithDecimals(1000).toString(), uuid(), domain);
      LogConsole.info('signFreezeData param:', param);
      res = await payment.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage for ca res:', res);
      expect(res).to.equal(true);
    }); 
  });

  await testCase();

  // await testCase('usdt');
  
})