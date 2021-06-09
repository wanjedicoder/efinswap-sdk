import JSBI from 'jsbi'
import ethers from "ethers";
import { getRouterContract, getContract, getProvider } from '../getContract'
import { Router } from '../router'
import { abi as ERC20ABI } from '../abis/TestToken.json'
import { Trade } from './trade'
import { Percent } from './fractions/percent'

export async function swap(trade: Trade, privateKey: string) {
  logSwap(trade)
  const chainId = trade.route.chainId
  const routerContract = getRouterContract(chainId, privateKey)
  const recipient = await routerContract.signer.getAddress()
  const ttl = 60 * 20

  const { methodName, args, value } = Router.swapCallParameters(trade, {
    feeOnTransfer: false,
    allowedSlippage: new Percent(JSBI.BigInt(Math.floor(80)), JSBI.BigInt(10000)),
    recipient,
    ttl
  })
  logApproveInput(trade, args, routerContract)
  const txApproval = await getContract(trade.route.path[0].address, ERC20ABI, getProvider(chainId), privateKey).approve(
    routerContract.address,
    args[0],
    {
      gasPrice: '0x37E11D600', // 15 gwei
      gasLimit: '0x989680'
    }
  )
  const approvalReceipt = await txApproval.wait()
  console.log(`Approval transaction hash: ${txApproval.hash}\n`)
  console.log(`Approval ransaction was mined in block ${approvalReceipt.blockNumber}`)
  const tx = await routerContract[methodName](...args, {
    // from: recipient,
    gasPrice: '0x37E11D600', // 15 gwei
    gasLimit: '0x989680', // 10000000
    ...(value && !isZero(value) ? { value } : {})
  })
  console.log(`Transaction hash: ${tx.hash}\n`)

  const receipt = await tx.wait()
  console.log(`Transaction was mined in block ${receipt.blockNumber}`)
}


function logSwap(trade: Trade) {
  const inputSymbol = trade.inputAmount.currency.symbol
  const outputSymbol = trade.outputAmount.currency.symbol
  const inputAmount = trade.inputAmount.toSignificant(3)
  const outputAmount = trade.outputAmount.toSignificant(3)

  console.log(`Swap ${inputAmount} ${inputSymbol} for ${outputAmount} ${outputSymbol}`)
  console.log('Path:', trade.route.path.map(token => `${token.symbol}:${token.address}`).join(' -> '))
}

function logApproveInput(trade: Trade, args: (string | string[])[], routerContract: ethers.Contract) {
  const inputSymbol = trade.inputAmount.currency.symbol
  console.log(
    `Approving ${inputSymbol}: spender: ${routerContract.address} - amount: ${JSBI.BigInt(args[0]).toString()}`
  )
}

function isZero(hexNumberString: string) {
  return /^0x0*$/.test(hexNumberString)
}