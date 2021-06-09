import { BigNumber } from '@ethersproject/bignumber'
import { TokenAmount } from "./entities";
import { getContract, getProvider, getRouterContract } from "./getContract";
import { abi as ERC20ABI } from './abis/TestToken.json'

export default async function approveToken(tokenAmount: TokenAmount, privateKey: string) {
  const gasPrice: string = '0x37E11D600'
  const gasLimit: string = '0x989680'
  const chainId = tokenAmount.token.chainId;
  const routerContract = getRouterContract(chainId, privateKey)
  let estimateGasLimit = null;
  const args = [routerContract.address, tokenAmount.raw.toString()]
  const contract = getContract(tokenAmount.token.address, ERC20ABI, getProvider(chainId), privateKey)

  try {
    const estimatedGasLimit = await contract.estimateGas.approve(...args)
    estimateGasLimit = estimatedGasLimit.mul(BigNumber.from(10000).add(BigNumber.from(1000))).div(BigNumber.from(10000))
  } catch (error) { }

  const txApproval = await contract.approve(
    ...args,
    estimateGasLimit ? { gasLimit: estimateGasLimit } : { gasPrice, gasLimit }
  )
  await txApproval.wait()
}