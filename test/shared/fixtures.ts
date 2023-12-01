import { BigNumber, Wallet } from 'ethers'
import { ethers, network } from 'hardhat'
import { ERC20Token } from '../../typechain/ERC20Token'
import { Payment } from '../../typechain/Payment'
import { Config } from '../../typechain/Config'
import { Fixture } from 'ethereum-waffle'
import { signData, computeDomainSeparator } from './signature-helper'
import { TypedDataDomain } from "@ethersproject/abstract-signer"
import { Signature } from "@ethersproject/bytes"
import { expandWithDecimals } from './numberDecimals'

async function erc20Contract(name: string, symbol: string, decimals: number): Promise<ERC20Token> {
    let factory = await ethers.getContractFactory('ERC20Token')
    let contract = (await factory.deploy(name, symbol, decimals)) as ERC20Token
    return contract
}

async function paymentContract(): Promise<Payment> {
    let factory = await ethers.getContractFactory('Payment')
    let contract = (await factory.deploy()) as Payment
    return contract
}

async function configContract(): Promise<Config> {
    let factory = await ethers.getContractFactory('Config')
    let contract = (await factory.deploy()) as Config
    return contract
}

export interface TradeData {
    user: string;
    token: string;
    amount: (string | number | BigNumber);
    fee: (string | number | BigNumber);
}

export interface PaymentFixture {
    usdt: ERC20Token
    usdc: ERC20Token
    payment: Payment,
    config: Config,
    signDepositAndFreezeData (
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any>,
    signWithdrawWithDetail (
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any>,
    signFreezeData (
        token: string,
        amount: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any>,
    signTransferData (
        token: string,
        from: string,
        to: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        amount: (string | number | BigNumber),
        fee: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any>,
    signCancelData (
        userA: TradeData,
        userB: TradeData,
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any>,
    
}

export const paymentFixture: Fixture<PaymentFixture> = async function ([owner, signer, feeTo, user1, user2]: Wallet[]): Promise<PaymentFixture> {
    const usdt = await erc20Contract("Test USDT", "USDT", 18)
    const usdc = await erc20Contract("Test USDC", "USDC", 18)
    await usdt.mint(owner.address, expandWithDecimals(10_000))
    await usdt.mint(owner.address, expandWithDecimals(10_000))

    await usdt.mint(user1.address, expandWithDecimals(10_000))
    await usdt.mint(user2.address, expandWithDecimals(10_000))
    
    await usdc.mint(user1.address, expandWithDecimals(10_000))
    await usdc.mint(user2.address, expandWithDecimals(10_000))
    
    const config = await configContract()

    const payment = await paymentContract()
    await payment.initialize()
    await payment.setNoSnEnabled(true)
    await payment.setSigner(signer.address)
    await payment.setFeeTo(feeTo.address)
    await payment.setupConfig(config.address)
    
    await usdt.connect(owner).approve(payment.address, expandWithDecimals(10_000))
    await usdt.connect(user1).approve(payment.address, expandWithDecimals(10_000))
    await usdt.connect(user2).approve(payment.address, expandWithDecimals(10_000))

    const signDepositAndFreezeData = async (
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = ethers.utils.hexZeroPad('0x' + sn, 32);
        const types = ['address', 'address', 'uint256', 'uint256', 'bytes32', 'address'];
        const values = [to, token, available, frozen, sn, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {to, token, available, frozen, sn, sign};
    }

    const signWithdrawWithDetail = async (
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = ethers.utils.hexZeroPad('0x' + sn, 32);
        const types = ['address', 'address', 'uint256', 'uint256', 'bytes32', 'address'];
        const values = [to, token, available, frozen, sn, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {to, token, available, frozen, sn, sign};
    }

    const signFreezeData = async (
        token: string,
        amount: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = ethers.utils.hexZeroPad('0x' + sn, 32);
        const types = ['address', 'uint256', 'bytes32', 'address'];
        const values = [token, amount, sn, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {token, amount, sn, sign};
    }

    const signTransferData = async (
        token: string,
        from: string,
        to: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        amount: (string | number | BigNumber),
        fee: (string | number | BigNumber),
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = ethers.utils.hexZeroPad('0x' + sn, 32);
        const types = ['address', 'address', 'address', 'uint256',  'uint256',  'uint256',  'uint256', 'bytes32', 'address'];
        const values = [token, from, to, available, frozen, amount, fee, sn, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {token, from, to, available, frozen, amount, fee, sn, sign};
    }

    const signCancelData = async (
        userA: TradeData,
        userB: TradeData,
        sn: string,
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = ethers.utils.hexZeroPad('0x' + sn, 32);
        const types = ['bytes32', 'address', 'address', 'uint256',  'uint256', 'address', 'address', 'uint256',  'uint256', 'address'];
        const values = [sn, userA.user, userA.token, userA.amount, userA.fee, userB.user, userB.token, userB.amount, userB.fee, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {userA, userB, sn, sign};
    }

    return { usdt, usdc, payment, config, signDepositAndFreezeData, signWithdrawWithDetail, signFreezeData, signTransferData, signCancelData }
}