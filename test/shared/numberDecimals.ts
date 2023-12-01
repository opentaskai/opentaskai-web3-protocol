import { BigNumber } from 'ethers'

export function expandWithDecimals(n: any, decimals=18): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(decimals))
}

export function reduceWithDecimals(n: any, decimals=18): BigNumber {
  return BigNumber.from(n).div(BigNumber.from(10).pow(decimals))
}