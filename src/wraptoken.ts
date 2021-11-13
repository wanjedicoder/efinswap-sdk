import { ethers } from "ethers";
import { BigNumber } from '@ethersproject/bignumber'
import { GAS_LIMIT, GAS_PRICE } from "./constants";
import { TokenAmount, WETH } from "./entities";
import { getContract, getProvider } from "./getContract";
import ABI from './abis/WETH.json'

export async function unwrapBNB(inputAmount: TokenAmount, privateKey: string) {
  const chainId = inputAmount.token.chainId
  const WBNB = WETH[chainId]
  const value = inputAmount.raw.toString()

  const contract = getContract(WBNB.address, ABI, getProvider(chainId), privateKey)

  const estimatedGas = await getEstimatedGas(contract, 'withdraw', [value])

  return contract.withdraw(value, estimatedGas)
}

export async function wrapBNB(inputAmount: TokenAmount, privateKey: string) {
  const chainId = inputAmount.token.chainId
  const WBNB = WETH[chainId]
  const value = inputAmount.raw.toString()
  const contract = getContract(WBNB.address, ABI, getProvider(chainId), privateKey)

  const estimatedGas = await getEstimatedGas(contract, 'deposit', [{ value }])

  return contract.deposit({ value, ...estimatedGas })
}

async function getEstimatedGas(contract: ethers.Contract, method: string, args: any[]) {
  try {
    const estimatedGasLimit = await contract.estimateGas[method](...args)
    const gasLimit = estimatedGasLimit.mul(BigNumber.from(10000).add(BigNumber.from(1000))).div(BigNumber.from(10000))
    return { gasLimit }
  } catch (error) {
    return { gasPrice: GAS_PRICE, gasLimit: GAS_LIMIT }
  }
}