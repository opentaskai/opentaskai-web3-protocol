import { BigNumber, Wallet } from 'ethers'
import { ethers, network } from 'hardhat'
import { ERC20Token } from '../../typechain/ERC20Token'
import { Payment } from '../../typechain/Payment'
import { NFT } from '../../typechain/NFT'
import { Config } from '../../typechain/Config'
import { Fixture } from 'ethereum-waffle'
import { signData, computeDomainSeparator } from './signature-helper'
import { TypedDataDomain } from "@ethersproject/abstract-signer"
import { Signature } from "@ethersproject/bytes"
import { expandWithDecimals } from './numberDecimals'
import { LogConsole } from './logconsol'
import { v4 } from 'uuid'

let chainId = network.config.chainId ? network.config.chainId: 31337

export function uuid() {
    return v4().replace(/-/g, '');
}

export function hexToBytes32(val: string) {
    if(val.substring(0,2) !== '0x') val = '0x'+val;
    return ethers.utils.hexZeroPad(val, 32);
}

export function bytes32ToHex(val: string, has0x: boolean = false) {
    if (val.substring(0, 2) !== '0x') val = '0x' + val;
    let res = ethers.utils.hexStripZeros(val);
    if (!has0x) res = res.substring(2);
    return res;
}

export function formatLogArgs(args: any, format: any) {
    const result: any = {};
    let i = 0;
    for(const k in format) {
        if(format[k] === 'bytes32') {
            result[k] = bytes32ToHex(args[i]);
        } else if(format[k] === 'address') {
            result[k] = args[i].toLowerCase();
        } else if(typeof format[k] === 'object' && format[k] !== null) {
            result[k] = formatLogArgs(args[i], format[k]);
        } else {
            result[k] = args[i].toString();
        }
        i++;
    }
    return result;
}

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

async function nftContract(): Promise<NFT> {
    let factory = await ethers.getContractFactory('NFT')
    let contract = (await factory.deploy()) as NFT
    return contract
}

export interface TradeData {
    account: string;
    token: string;
    amount: (string | number | BigNumber);
    fee: (string | number | BigNumber);
}

export interface PaymentFixture {
    usdt: ERC20Token
    usdc: ERC20Token
    payment: Payment,
    config: Config,
    signBindAccountData (
        user: string,
        account: string,
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signReplaceAccountData (
        user: string,
        account: string,
        wallet: string,
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signDepositData (
        user: string,
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signWithdrawData (
        from: string,
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signFreezeData (
        account: string,
        token: string,
        amount: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signUnFreezeData (
        account: string,
        token: string,
        amount: (string | number | BigNumber),
        fee: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signTransferData (
        out: string,
        token: string,
        from: string,
        to: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        amount: (string | number | BigNumber),
        fee: (string | number | BigNumber),
        paid: (string | number | BigNumber),
        excessFee: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    signCancelData (
        userA: TradeData,
        userB: TradeData,
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
    
}

export const paymentFixture: Fixture<PaymentFixture> = async function ([owner, signer, feeTo, user1, user2, user3]: Wallet[]): Promise<PaymentFixture> {
    const usdt = await erc20Contract("Test USDT", "USDT", 18)
    const usdc = await erc20Contract("Test USDC", "USDC", 18)
    await usdt.mint(owner.address, expandWithDecimals(10_000))
    await usdt.mint(owner.address, expandWithDecimals(10_000))

    await usdt.mint(user1.address, expandWithDecimals(10_000))
    await usdt.mint(user2.address, expandWithDecimals(10_000))
    await usdt.mint(user3.address, expandWithDecimals(10_000))
    
    await usdc.mint(user1.address, expandWithDecimals(10_000))
    await usdc.mint(user2.address, expandWithDecimals(10_000))
    await usdc.mint(user3.address, expandWithDecimals(10_000))
    
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
    await usdt.connect(user3).approve(payment.address, expandWithDecimals(10_000))

    const signBindAccountData = async (
        user: string,
        account: string,
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        account = hexToBytes32(account);
        sn = hexToBytes32(sn);
        const types = ['address', 'bytes32', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [user, account, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {user, account, sn, expired, sign};
    }

    const signReplaceAccountData = async (
        user: string,
        account: string,
        wallet: string,
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        account = hexToBytes32(account);
        sn = hexToBytes32(sn);
        const types = ['address', 'bytes32', 'address', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [user, account, wallet, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {user, account, wallet, sn, expired, sign};
    }

    const signDepositData = async (
        user: string,
        to: string,
        token: string,
        amount: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        to = hexToBytes32(to);
        sn = hexToBytes32(sn);
        const types = ['address', 'bytes32', 'address', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [user, to, token, amount, frozen, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {to, token, amount, frozen, sn, expired, sign};
    }

    const signWithdrawData = async (
        from: string,
        to: string,
        token: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = hexToBytes32(sn);
        const types = ['bytes32', 'address', 'address', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [from, to, token, available, frozen, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {from, to, token, available, frozen, sn, expired, sign};
    }

    const signFreezeData = async (
        account: string,
        token: string,
        amount: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = hexToBytes32(sn);
        account = hexToBytes32(account);
        const types = ['bytes32', 'address', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [account, token, amount, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {account, token, amount, sn, expired, sign};
    }

    const signUnFreezeData = async (
        account: string,
        token: string,
        amount: (string | number | BigNumber),
        fee: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = hexToBytes32(sn);
        account = hexToBytes32(account);
        const types = ['bytes32', 'address', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [account, token, amount, fee, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {account, token, amount, fee, sn, expired, sign};
    }

    const signTransferData = async (
        out: string,
        token: string,
        from: string,
        to: string,
        available: (string | number | BigNumber),
        frozen: (string | number | BigNumber),
        amount: (string | number | BigNumber),
        fee: (string | number | BigNumber),
        paid: (string | number | BigNumber),
        excessFee: (string | number | BigNumber),
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = hexToBytes32(sn);
        from = hexToBytes32(from);
        to = hexToBytes32(to);
        const types = ['address', 'address', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256', 'address'];
        const values = [out, token, from, to, available, frozen, amount, fee, paid, excessFee, sn, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {out, token, from, to, available, frozen, amount, fee, paid, excessFee, sn, expired, sign};
    }

    const signCancelData = async (
        userA: TradeData,
        userB: TradeData,
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = hexToBytes32(sn);
        userA.account = hexToBytes32(userA.account);
        userB.account = hexToBytes32(userB.account);
        const types = ['bytes32', 'bytes32', 'address', 'uint256',  'uint256', 'bytes32', 'address', 'uint256',  'uint256', 'uint256', 'uint256', 'address'];
        const values = [sn, userA.account, userA.token, userA.amount, userA.fee, userB.account, userB.token, userB.amount, userB.fee, expired, chainId, payment.address]
        const sign = await signData(signer.address, types, values, domain);
        return {userA, userB, sn, expired, sign};
    }

    return { usdt, usdc, payment, config, signBindAccountData, signReplaceAccountData, signDepositData, signWithdrawData, signFreezeData, signUnFreezeData, signTransferData, signCancelData }
}

export interface NFTFixture {
    nft: NFT,
    config: Config,
    signMintData (
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any>,
}

export const nftFixture: Fixture<NFTFixture> = async function ([owner, signer, feeTo, user1, user2]: Wallet[]): Promise<NFTFixture> {
    const config = await configContract()

    const nft = await nftContract()
    await nft.initialize("OpenTaskAI Originals", "AIOriginals")
    await nft.setSigner(signer.address)
    await nft.setupConfig(config.address)
    
    const signMintData = async (
        sn: string,
        expired: (string | number | BigNumber),
        domain?: TypedDataDomain
    ): Promise<any> => {
        sn = hexToBytes32(sn);
        const types = ['bytes32', 'uint256', 'uint256', 'address'];
        const values = [sn, expired, chainId, nft.address]
        const sign = await signData(signer.address, types, values, domain);
        return {sn, expired, sign};
    }

    return { nft, config, signMintData }
}