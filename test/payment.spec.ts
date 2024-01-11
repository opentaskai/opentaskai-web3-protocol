import { Wallet, BigNumber } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { ERC20Token } from '../typechain/ERC20Token'
import { Payment } from '../typechain/Payment'
import { expect } from './shared/expect'
import { computeDomainSeparator } from './shared/signature-helper'
import { paymentFixture, PaymentFixture, TradeData, uuid, hexToBytes32 } from './shared/fixtures'
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { LogConsole } from './shared/logconsol'
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
let owner: SignerWithAddress, signer: SignerWithAddress, feeTo:SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress;
let usdt: ERC20Token
let usdc: ERC20Token
let payment: Payment
let payFix: PaymentFixture
let tokenInstance: ERC20Token
let tokenAddr: string
let tokenName: string
let expired = Math.floor(Date.now() / 1000) + 300;
let feeToAccount = '0x0000000000000000000000000000000000000000000000000000000000000001'
let ownerAccount = hexToBytes32(uuid())
let user1Account = hexToBytes32(uuid())
let user2Account = hexToBytes32(uuid())
let user3Account = hexToBytes32(uuid())

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
    [owner, signer, feeTo, user1, user2, user3] = await (ethers as any).getSigners()
    LogConsole.info('owner, signer, feeTo, user1, user2, user3:', owner.address, signer.address, feeTo.address, user1.address, user2.address, user3.address)
    loadFixTure = createFixtureLoader([owner, signer, feeTo, user1, user2, user3])
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
    let param: any = await payFix.signBindAccountData(ownerAccount, uuid(), expired);
    LogConsole.trace('signBindAccountData param:', param);
    await payment.bindAccount(param.account, param.sn, param.expired, param.sign.compact);

    param = await payFix.signBindAccountData(user1Account, uuid(), expired);
    LogConsole.trace('signBindAccountData param:', param);
    await payment.connect(user1).bindAccount(param.account, param.sn, param.expired, param.sign.compact);

    param = await payFix.signBindAccountData(user2Account, uuid(), expired);
    LogConsole.trace('signBindAccountData param:', param);
    await payment.connect(user2).bindAccount(param.account, param.sn, param.expired, param.sign.compact);
  })

  afterEach('clean case', async () => {
    LogConsole.debug('afterEach');
    LogConsole.debug('tokenName:', tokenName);
    LogConsole.debug('tokenAddr:', tokenAddr);
  })
    tokenName = _tokenName;
    const depositAmount = expandWithDecimals(6);
    const frozenAmount = depositAmount.div(2);
    const availableAmount = depositAmount.sub(frozenAmount);

    it('simpleDeposit', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      if(tokenAddr === ZERO_ADDRESS) {
        await expect(payment.simpleDeposit(user1Account, tokenAddr, depositAmount, getPayOption(1, tokenAddr))).to.be.revertedWith('invalid value');
      }

      let tx = await payment.simpleDeposit(user1Account, tokenAddr, depositAmount, getPayOption(depositAmount, tokenAddr));
      const receipt:any = await tx.wait()
      LogConsole.info('simpleDeposit gasUsed:', receipt.gasUsed);
      LogConsole.debug('simpleDeposit events:', receipt.events[0].args);
      expect(tx).to.emit(payment, 'SimpleDepositLog')
      .withArgs(user1Account, tokenAddr, depositAmount, owner.address)
      
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

      let userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount);
      expect(userAccount.frozen).to.equal(BigNumber.from(0));

      await payment.simpleDeposit(user1Account, tokenAddr, depositAmount, {
        value: depositAmount
      });
      
      userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount.mul(2));
      expect(userAccount.frozen).to.equal(BigNumber.from(0));
    });

    it('deposit fail', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      sn = uuid();
      let param: any = await payFix.signDepositData(user1Account, tokenAddr, frozenAmount.div(2), frozenAmount, sn, expired);
      LogConsole.trace('signDepositData param:', param);

      await expect(payment.deposit(param.to, param.token, param.amount.add(1), param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(frozenAmount.div(2), tokenAddr))).to.be.revertedWith('invalid signature');
      
      await expect(payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(frozenAmount.div(2), tokenAddr))).to.be.revertedWith('insufficient available');
      
      param = await payFix.signDepositData(user1Account, tokenAddr, frozenAmount, frozenAmount, sn, expired);
      if(tokenAddr === ZERO_ADDRESS) {
        await expect(payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(1, tokenAddr))).to.be.revertedWith('invalid value');
      }

      param = await payFix.signDepositData(user1Account, tokenAddr, 0, 0, sn, expired);
      await expect(payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(0, tokenAddr))).to.be.revertedWith('zero');

      await payment.setAutoBindEnabled(false);
      param = await payFix.signDepositData(user3Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await expect(payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr))).to.be.revertedWith('no bind');
    });

    it('deposit', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      sn = uuid();
      let param: any = await payFix.signDepositData(user1Account, tokenAddr, depositAmount, frozenAmount, sn, expired);
      LogConsole.trace('signDepositData param:', param);

      let tx = await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));
      const receipt:any = await tx.wait()
      LogConsole.info('deposit gasUsed:', receipt.gasUsed);
      LogConsole.debug('deposit events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'DepositLog')
      .withArgs(param.sn, param.token, param.to, param.amount, param.frozen, owner.address)
      
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

      let userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount.sub(frozenAmount))
      expect(userAccount.frozen).to.equal(frozenAmount);
      
      await expect(payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr))).to.be.revertedWith('record already exists');

      param = await payFix.signDepositData(user3Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));
      userAccount = await payment.userAccounts(user3Account, tokenAddr);
      LogConsole.debug('user3Account:', userAccount);
      expect(userAccount.available).to.equal(depositAmount.sub(frozenAmount))
      expect(userAccount.frozen).to.equal(frozenAmount);

      res = await payment.getUserAssets(user3Account, [tokenAddr]);
      LogConsole.debug('getUserAssets:', res);
      expect(res.length).to.equal(1);
      expect(userAccount.available).to.equal(res[0].available)
      expect(userAccount.frozen).to.equal(res[0].frozen);

      res = await payment.getMultiUserAssets([user1Account, user3Account], [tokenAddr, tokenAddr]);
      LogConsole.debug('getMultiUserAssets:', res);
      expect(res.length).to.equal(2);

    });

    it('withdraw', async () => {
      let ownerBalance = await getBalance(owner);
      LogConsole.debug('owner balance:', ownerBalance);

      let userBalance = await getBalance(user1);
      LogConsole.debug('user balance:', userBalance);

      
      let param: any = await payFix.signDepositData(user1Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      LogConsole.trace('signDepositData param:', param);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));
      
      param = await payFix.signWithdrawData(user1.address, tokenAddr, availableAmount, frozenAmount, uuid(), expired);
      LogConsole.trace('signWithdrawData param:', param);

      await expect(payment.connect(user1).withdraw(payment.address, param.token, param.available, param.frozen, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('invalid signature');
      
      let tx = await payment.connect(user1).withdraw(param.to, param.token, param.available, param.frozen, param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('withdraw gasUsed:', receipt.gasUsed);
      LogConsole.debug('withdraw events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'WithdrawLog')
      .withArgs(param.sn, param.token, user1Account, param.to, param.available, param.frozen, user1.address)

      let userBalance2 = await getBalance(user1);
      LogConsole.debug('user balance2:', userBalance2);
      if(tokenAddr === ZERO_ADDRESS) {
        expect(userBalance2).to.gt(userBalance);
      } else {
        expect(userBalance2).to.equal(userBalance.add(param.available).add(param.frozen));
      }
      
      await expect(payment.connect(user1).withdraw(param.to, param.token, param.available, param.frozen, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('record already exists');
      
    });

    it('freeze', async () => {
      await payment.simpleDeposit(user1Account, tokenAddr, depositAmount, getPayOption(depositAmount, tokenAddr));
      let userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      
      let param: any = await payFix.signFreezeData(user1Account, tokenAddr, frozenAmount, uuid(), expired);
      LogConsole.trace('signFreezeData param:', param);

      await expect(payment.connect(user1).freeze(param.account, param.token, param.amount.add(1), param.sn, param.expired, param.sign.compact)).to.be.revertedWith('invalid signature');

      await expect(payment.connect(user2).freeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('forbidden');

      let tx = await payment.connect(user1).freeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('freeze gasUsed:', receipt.gasUsed);
      LogConsole.debug('freeze events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'FreezeLog')
      .withArgs(param.sn, param.account, param.token, param.amount, user1.address);


      userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount.sub(frozenAmount));
      expect(userAccount.frozen).to.equal(frozenAmount);

      await expect(payment.freeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('record already exists');

      param = await payFix.signFreezeData(user1Account, tokenAddr, depositAmount.mul(2), uuid(), expired);
      LogConsole.trace('signFreezeData param:', param);
      await expect(payment.freeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('insufficient available');

      // freeze by admin(owner)
      param = await payFix.signFreezeData(user1Account, tokenAddr, frozenAmount, uuid(), expired);
      await payment.freeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact);
      userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(BigNumber.from(0));
      expect(userAccount.frozen).to.equal(depositAmount);

    });

    it('unfreeze', async () => {
      await payment.simpleDeposit(user1Account, tokenAddr, depositAmount, getPayOption(depositAmount, tokenAddr));

      let param: any = await payFix.signFreezeData(user1Account, tokenAddr, frozenAmount, uuid(), expired);
      // LogConsole.trace('signFreezeData param:', param);
      await payment.connect(user1).freeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact);

      param = await payFix.signFreezeData(user1Account, tokenAddr, frozenAmount, uuid(), expired);

      await expect(payment.connect(user1).unfreeze(param.account, param.token, param.amount.add(1), param.sn, param.expired, param.sign.compact)).to.be.revertedWith('invalid signature');
      await expect(payment.connect(user3).unfreeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('forbidden');

      let tx = await payment.connect(user1).unfreeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      LogConsole.info('unfreeze gasUsed:', receipt.gasUsed);
      LogConsole.debug('unfreeze events:', receipt.events[0].args);

      expect(tx).to.emit(payment, 'UnfreezeLog')
      .withArgs(param.sn, param.account, param.token, param.amount, user1.address);

      let userAccount = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('userAccount:', userAccount);
      expect(userAccount.available).to.equal(depositAmount);
      expect(userAccount.frozen).to.equal(BigNumber.from(0));

      await expect(payment.unfreeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('record already exists');

      param = await payFix.signFreezeData(user1Account, tokenAddr, depositAmount.mul(2), uuid(), expired);
      await expect(payment.unfreeze(param.account, param.token, param.amount, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('insufficient frozen');

    });

    it('inner transfer', async () => {
      const availableTradeAmount = expandWithDecimals(2);
      const frozenTradeAmount = expandWithDecimals(1);
      
      // simpleDeposit and freeze for user1
      let param: any = await payFix.signDepositData(user1Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // simpleDeposit and freeze for user2
      param = await payFix.signDepositData(user2Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // preparing transfer data 
      param = await payFix.signTransferData(ZERO_ADDRESS, tokenAddr, user1Account, user2Account, availableTradeAmount, frozenTradeAmount, availableTradeAmount, frozenTradeAmount, uuid(), expired);
      LogConsole.trace('signTransferData:', param);
      const transferData = { ...param };
      delete transferData.out;
      delete transferData.sn;
      delete transferData.sign;
      LogConsole.debug('transferData:', transferData);

      // test reverted with reason string 'invalid signature'
      let invalidDealData = { ... transferData };
      invalidDealData.token = payment.address;
      await expect(payment.transfer(param.out, invalidDealData, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('invalid signature');
      
      // test reverted with reason string 'invalid deal'
      invalidDealData = { ... transferData };
      invalidDealData.available = invalidDealData.available.add(1);
      await expect(payment.transfer(param.out, invalidDealData, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('invalid deal');

      let userAccount = await payment.userAccounts(user1Account, param.token);
      LogConsole.debug('userAccount:', userAccount);

      // test reverted with reason string 'insufficient available'
      await payment.connect(user1).simpleWithdraw(user1.address, param.token, userAccount.available);
      await expect(payment.transfer(param.out, transferData, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('insufficient available');
      await payment.simpleDeposit(user1Account, tokenAddr, userAccount.available, getPayOption(userAccount.available, tokenAddr));
      
      // test reverted with reason string 'insufficient frozen'
      const freezeParam = await payFix.signFreezeData(user1Account, tokenAddr, userAccount.frozen, uuid(), expired);
      await payment.connect(user1).unfreeze(freezeParam.account, freezeParam.token, freezeParam.amount, freezeParam.sn, freezeParam.expired, freezeParam.sign.compact)
      await expect(payment.transfer(ZERO_ADDRESS, transferData, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('insufficient frozen');
      const unfreezeParam: any = await payFix.signFreezeData(user1Account, tokenAddr, userAccount.frozen, uuid(), expired);
      await payment.connect(user1).freeze(freezeParam.account, unfreezeParam.token, unfreezeParam.amount, unfreezeParam.sn, unfreezeParam.expired, unfreezeParam.sign.compact);
      
      await expect(payment.connect(user3).transfer(param.out, transferData, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('forbidden');
    
      const user1AccountBefore = await payment.userAccounts(user1Account, param.token);
      LogConsole.debug('user1AccountBefore:', user1AccountBefore);

      const user2AccountBefore = await payment.userAccounts(user2Account, param.token);
      LogConsole.debug('user2AccountBefore:', user2AccountBefore);

      const feeToAccountBefore = await payment.userAccounts(feeToAccount, param.token);
      LogConsole.debug('feeToAccountBefore:', feeToAccountBefore);

      const paymentBalanceBefore = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceBefore:', paymentBalanceBefore);
      
      // test inner transfer
      LogConsole.debug('transferData:', transferData);
      let tx = await payment.transfer(param.out, transferData, param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      const events = receipt.events[receipt.events.length-1].args
      LogConsole.info('transfer gasUsed:', receipt.gasUsed);
      LogConsole.debug('transfer events:', events);
      const eventDeal = {...transferData};
      delete eventDeal.expired;
      expect(events._sn).to.equal(param.sn);
      expect(events._out).to.equal(param.out);
      expect(events._operator).to.equal(owner.address);
      
      const user1AccountAfter = await payment.userAccounts(user1Account, param.token);
      LogConsole.debug('user1AccountAfter:', user1AccountAfter);
      const user2AccountAfter = await payment.userAccounts(user2Account, param.token);
      LogConsole.debug('user2AccountAfter:', user2AccountAfter);
      const feeToAccountAfter = await payment.userAccounts(feeToAccount, param.token);
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
      
      // simpleDeposit and freeze for user1
      let param: any = await payFix.signDepositData(user1Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // simpleDeposit and freeze for user2
      param = await payFix.signDepositData(user2Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // preparing transfer data 
      param = await payFix.signTransferData(user2.address, tokenAddr, user1Account, user2Account, availableTradeAmount, frozenTradeAmount, availableTradeAmount, frozenTradeAmount, uuid(), expired);
      LogConsole.trace('signTransferData:', param);
      const transferData = { ...param };
      delete transferData.out;
      delete transferData.sn;
      delete transferData.sign;
      LogConsole.debug('transferData:', transferData);

    
      const user1AccountBefore = await payment.userAccounts(user1Account, param.token);
      LogConsole.debug('user1AccountBefore:', user1AccountBefore);

      const user2AccountBefore = await payment.userAccounts(user2Account, param.token);
      LogConsole.debug('user2AccountBefore:', user2AccountBefore);

      const feeToAccountBefore = await payment.userAccounts(feeToAccount, param.token);
      LogConsole.debug('feeToAccountBefore:', feeToAccountBefore);

      const paymentBalanceBefore = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceBefore:', paymentBalanceBefore);
      
      // test transfer an simpleWithdraw
      let userBalance = await getBalance(user2);
      let feeToBalance = await getBalance(feeTo);
      let tx = await payment.transfer(user2.address, transferData, param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      const events = receipt.events[receipt.events.length-1].args
      LogConsole.info('transfer gasUsed:', receipt.gasUsed);
      LogConsole.debug('transfer events:', events);
      const eventDeal = {...transferData};
      delete eventDeal.expired;
      expect(events._sn).to.equal(param.sn);
      expect(events._out).to.equal(param.out);
      expect(events._operator).to.equal(owner.address);
      
      const user1AccountAfter = await payment.userAccounts(user1Account, param.token);
      LogConsole.debug('user1AccountAfter:', user1AccountAfter);
      const user2AccountAfter = await payment.userAccounts(user2Account, param.token);
      LogConsole.debug('user2AccountAfter:', user2AccountAfter);
      const feeToAccountAfter = await payment.userAccounts(feeToAccount, param.token);
      LogConsole.debug('feeToAccountAfter:', feeToAccountAfter);
      const paymentBalanceAfter = await payment.getBalance(param.token)
      LogConsole.debug('paymentBalanceAfter:', paymentBalanceAfter);

      let userBalance2 = await getBalance(user2);
      // LogConsole.debug('user2 balance2:', userBalance2);
      expect(userBalance2).to.equal(userBalance.add(param.amount));

      let feeToBalance2 = await getBalance(feeTo);
      // LogConsole.debug('feeTo balance2:', feeToBalance2);
      expect(feeToBalance2).to.equal(feeToBalance.add(param.fee));

      expect(user1AccountAfter.available).to.equal(user1AccountBefore.available.sub(availableTradeAmount));
      expect(user1AccountAfter.frozen).to.equal(user1AccountBefore.frozen.sub(frozenTradeAmount));
      expect(user2AccountAfter.available).to.equal(user2AccountBefore.available);
      expect(user2AccountAfter.frozen).to.equal(user2AccountBefore.frozen);
      expect(feeToAccountAfter.available).to.equal(feeToAccountBefore.available);
      expect(feeToAccountAfter.frozen).to.equal(feeToAccountBefore.frozen);
      expect(paymentBalanceAfter).to.equal(paymentBalanceBefore.sub(availableTradeAmount).sub(frozenTradeAmount));
      
    });

    it('cancel', async () => {
      // simpleDeposit and freeze for user1
      let param: any = await payFix.signDepositData(user1Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // simpleDeposit and freeze for user2
      param = await payFix.signDepositData(user2Account, tokenAddr, depositAmount, frozenAmount, uuid(), expired);
      await payment.deposit(param.to, param.token, param.amount, param.frozen, param.sn, param.expired, param.sign.compact, getPayOption(depositAmount, tokenAddr));

      // preparing cancel data 
      const userA: TradeData = {
        account: user1Account,
        token: tokenAddr,
        amount: frozenAmount,
        fee: frozenAmount.div(2)
      }

      const userB: TradeData = {
        account: user2Account,
        token: tokenAddr,
        amount: frozenAmount,
        fee: frozenAmount.div(2)
      }

      param = await payFix.signCancelData(userA, userB, uuid(), expired);
      LogConsole.trace('signCancelData:', param);

      // test reverted with reason string 'invalid signature'
      await expect(payment.cancel(param.userA, param.userA, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('invalid signature');
      
      // test reverted with reason string 'insufficient frozen'
      let freezeParam: any = await payFix.signFreezeData(user1Account, tokenAddr, frozenAmount, uuid(), expired);
      await payment.connect(user1).unfreeze(freezeParam.account, freezeParam.token, freezeParam.amount, freezeParam.sn, freezeParam.expired, freezeParam.sign.compact);
      await expect(payment.cancel(param.userA, param.userB, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('insufficient frozen');
      freezeParam = await payFix.signFreezeData(user1Account, tokenAddr, frozenAmount, uuid(), expired);
      await payment.connect(user1).freeze(freezeParam.account, freezeParam.token, freezeParam.amount, freezeParam.sn, freezeParam.expired, freezeParam.sign.compact);
      
      await expect(payment.connect(user3).cancel(param.userA, param.userB, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('forbidden');

      const user1AccountBefore = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('user1AccountBefore:', user1AccountBefore);

      const user2AccountBefore = await payment.userAccounts(user2Account, tokenAddr);
      LogConsole.debug('user2AccountBefore:', user2AccountBefore);

      const feeToAccountBefore = await payment.userAccounts(feeToAccount, tokenAddr);
      LogConsole.debug('feeToAccountBefore:', feeToAccountBefore);

      const paymentBalanceBefore = await payment.getBalance(tokenAddr)
      LogConsole.debug('paymentBalanceBefore:', paymentBalanceBefore);
      
      // test cancel
      let tx = await payment.cancel(param.userA, param.userB, param.sn, param.expired, param.sign.compact);
      const receipt:any = await tx.wait()
      const events = receipt.events[receipt.events.length-1].args
      LogConsole.info('cancel gasUsed:', receipt.gasUsed);
      LogConsole.debug('cancel events:', events);
      expect(events._sn).to.equal(param.sn);

      const user1AccountAfter = await payment.userAccounts(user1Account, tokenAddr);
      LogConsole.debug('user1AccountAfter:', user1AccountAfter);
      const user2AccountAfter = await payment.userAccounts(user2Account, tokenAddr);
      LogConsole.debug('user2AccountAfter:', user2AccountAfter);
      const feeToAccountAfter = await payment.userAccounts(feeToAccount, tokenAddr);
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

      await expect(payment.cancel(param.userA, param.userB, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('record already exists');
          
      const records = await payment.getRecords([param.sn, freezeParam.sn])
      LogConsole.debug('records:', records);
      
    });
    
  });
}

const testBase = async () => {
  describe('Base', async () => {
    let loadFixTure: ReturnType<typeof createFixtureLoader>;

  before('create fixture loader', async () => {
    [owner, signer, feeTo, user1, user2, user3] = await (ethers as any).getSigners()
    LogConsole.info('owner, signer, feeTo, user1, user2:', owner.address, signer.address, feeTo.address, user1.address, user2.address, user3.address)
    loadFixTure = createFixtureLoader([owner, signer, feeTo, user1, user2, user3])
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
      await expect(payment.connect(user1).setNoSnEnabled(false)).to.be.revertedWith('dev forbidden');
      await expect(payment.connect(user1).setAutoBindEnabled(false)).to.be.revertedWith('dev forbidden');
      await expect(payment.connect(user1).setMaxWalletCount(1)).to.be.revertedWith('dev forbidden');

      await payment.changeOwner(signer.address);
      res = await payment.owner();
      expect(res).to.equal(signer.address);

      await payment.connect(signer).changeOwner(owner.address);
      res = await payment.owner();
      expect(res).to.equal(owner.address);

      res = await payment.getWalletsOfAccount(feeToAccount);
      LogConsole.info('getWalletsOfAccount:', res);
      expect(res.length).to.equal(1);
      expect(res[0]).to.equal(feeTo.address);
      
      await payment.setFeeTo(owner.address);
      res = await payment.feeTo();
      expect(res).to.equal(owner.address);

      res = await payment.getWalletsOfAccount(feeToAccount);
      LogConsole.info('getWalletsOfAccount:', res);
      expect(res.length).to.equal(1);
      expect(res[0]).to.equal(owner.address);

    });

    it('verifyMessage false', async () => {
      const param: any = await payFix.signFreezeData(user1Account, usdt.address, expandWithDecimals(1000).toString(), uuid(), expired);
      LogConsole.trace('signFreezeData param:', param);
      res = await payment.verifyMessage(param.sn, param.sign.compact);
      LogConsole.info('verifyMessage for eoa res:', res);
      expect(res).to.equal(false);
    }); 

    it('verifyMessage for eoa', async () => {
      let param: any = await payFix.signFreezeData(user1Account, usdt.address, expandWithDecimals(1000).toString(), uuid(), expired);
      LogConsole.info('signFreezeData param:', param);
      res = await payment.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage for eoa res:', res);
      expect(res).to.equal(true);

      const availableTradeAmount = expandWithDecimals(2);
      const frozenTradeAmount = expandWithDecimals(1);
      param = await payFix.signTransferData(ZERO_ADDRESS, ZERO_ADDRESS, user1Account, user2Account, availableTradeAmount, frozenTradeAmount, availableTradeAmount, frozenTradeAmount, uuid(), expired);
      LogConsole.trace('signTransferData:', param);
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

      const param: any = await payFix.signFreezeData(user1Account, usdt.address, expandWithDecimals(1000).toString(), uuid(), expired, domain);
      LogConsole.info('signFreezeData param:', param);
      res = await payment.verifyMessage(param.sign.messageHash, param.sign.compact);
      LogConsole.info('verifyMessage for ca res:', res);
      expect(res).to.equal(true);
    }); 

    it('bind', async () => {
      let param: any = await payFix.signBindAccountData(feeToAccount, uuid(), expired);
      LogConsole.trace('signBindAccountData param:', param);
      await expect(payment.connect(user3).bindAccount(param.account, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('forbidden');
      await expect(payment.connect(feeTo).bindAccount(param.account, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('already bound');

      param = await payFix.signBindAccountData(user1Account, uuid(), 1);
      LogConsole.trace('signBindAccountData param:', param);
      await expect(payment.connect(user1).bindAccount(param.account, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('request is expired');

      param = await payFix.signBindAccountData(user1Account, uuid(), expired);
      LogConsole.trace('signBindAccountData param:', param);
      await expect(payment.connect(user1).bindAccount(param.account, param.sn, param.expired+1, param.sign.compact)).to.be.revertedWith('invalid signature');

      let tx = await payment.connect(user1).bindAccount(param.account, param.sn, param.expired, param.sign.compact);
      let receipt:any = await tx.wait()
      LogConsole.info('bindAccount gasUsed:', receipt.gasUsed);
      LogConsole.debug('bindAccount events:', receipt.events[0].args);
      expect(tx).to.emit(payment, 'BindLog')
      .withArgs(user1Account, user1.address)
      
      await expect(payment.connect(user1).bindAccount(param.account, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('record already exists');

      param = await payFix.signBindAccountData(user1Account, uuid(), expired);
      LogConsole.trace('signBindAccountData param:', param);
      await expect(payment.connect(user2).bindAccount(param.account, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('over wallet count');

      res = await payment.getWalletsOfAccount(user1Account);
      LogConsole.info('getWalletsOfAccount:', res);
      expect(res.length).to.equal(1);
      expect(res[0]).to.equal(user1.address);

      await payment.setMaxWalletCount(2);
      await payment.connect(user2).bindAccount(param.account, param.sn, param.expired, param.sign.compact);
      res = await payment.getWalletsOfAccount(user1Account);
      LogConsole.info('getWalletsOfAccount:', res);
      expect(res.length).to.equal(2);

      param = await payFix.signBindAccountData(user1Account, uuid(), expired);
      LogConsole.trace('signBindAccountData param:', param);
      await expect(payment.connect(user3).bindAccount(param.account, param.sn, param.expired, param.sign.compact)).to.be.revertedWith('over wallet count');

      tx = await payment.connect(user1).unbindAccount();
      receipt = await tx.wait()
      LogConsole.info('unbindAccount gasUsed:', receipt.gasUsed);
      LogConsole.debug('unbindAccount events:', receipt.events[0].args);
      expect(tx).to.emit(payment, 'UnbindLog')
      .withArgs(user1Account, user1.address)

      res = await payment.getWalletsOfAccount(user1Account);
      LogConsole.info('getWalletsOfAccount:', res);
      expect(res.length).to.equal(1);

      await payment.connect(user3).bindAccount(param.account, param.sn, param.expired, param.sign.compact)
      res = await payment.getWalletsOfAccount(user1Account);
      LogConsole.info('getWalletsOfAccount:', res);
      expect(res.length).to.equal(2);
    });
  });
}

describe('Payment', async () => {
  
  await testBase();

  await testCase();

  await testCase('usdt');
  
})