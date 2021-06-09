import { Price } from './fractions/price'
import { TokenAmount } from './fractions/tokenAmount'
import invariant from 'tiny-invariant'
import JSBI from 'jsbi'
import { pack, keccak256 } from '@ethersproject/solidity'
import { getCreate2Address } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { getRouterContract } from '../getContract'
import { isZero } from '../utils'
import { ETHER } from '../entities'

import {
  BigintIsh,
  FACTORY_ADDRESS_BY_CHAIN,
  INIT_CODE_HASH_BY_CHAIN,
  MINIMUM_LIQUIDITY,
  ZERO,
  ONE,
  FIVE,
  _998,
  _1000,
  ChainId
} from '../constants'
import { sqrt, parseBigintIsh } from '../utils'
import approveToken from '../approveToken'
import { InsufficientReservesError, InsufficientInputAmountError } from '../errors'
import { Token } from './token'
import { Percent } from './fractions'

let PAIR_ADDRESS_CACHE: { [token0Address: string]: { [token1Address: string]: string } } = {}

export type LiquidityInfoOf = {
  totalSupply: TokenAmount;
  userLiquidity: TokenAmount;
  reserves: [TokenAmount, TokenAmount];
  liquidityAmountToken0: TokenAmount,
  liquidityAmountToken1: TokenAmount,
}

export type RemoveLiquidityAmounts = {
  liquidityAmountToken0ToRemove: TokenAmount;
  liquidityAmountToken1ToRemove: TokenAmount;
  liquidityAmountTokenToRemove: TokenAmount;
  percent: Percent;
}

export class Pair {
  public readonly liquidityToken: Token
  private readonly tokenAmounts: [TokenAmount, TokenAmount]

  public static getAddress(tokenA: Token, tokenB: Token): string {
    const tokens = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks

    if (PAIR_ADDRESS_CACHE?.[tokens[0].address]?.[tokens[1].address] === undefined) {
      PAIR_ADDRESS_CACHE = {
        ...PAIR_ADDRESS_CACHE,
        [tokens[0].address]: {
          ...PAIR_ADDRESS_CACHE?.[tokens[0].address],
          [tokens[1].address]: getCreate2Address(
            FACTORY_ADDRESS_BY_CHAIN[tokenA.chainId],
            keccak256(['bytes'], [pack(['address', 'address'], [tokens[0].address, tokens[1].address])]),
            INIT_CODE_HASH_BY_CHAIN[tokenA.chainId]
          )
        }
      }
    }

    return PAIR_ADDRESS_CACHE[tokens[0].address][tokens[1].address]
  }

  public constructor(tokenAmountA: TokenAmount, tokenAmountB: TokenAmount) {
    const tokenAmounts = tokenAmountA.token.sortsBefore(tokenAmountB.token) // does safety checks
      ? [tokenAmountA, tokenAmountB]
      : [tokenAmountB, tokenAmountA]
    this.liquidityToken = new Token(
      tokenAmounts[0].token.chainId,
      Pair.getAddress(tokenAmounts[0].token, tokenAmounts[1].token),
      18,
      'UNI-V2',
      'Uniswap V2'
    )
    this.tokenAmounts = tokenAmounts as [TokenAmount, TokenAmount]
  }

  /**
   * Returns true if the token is either token0 or token1
   * @param token to check
   */
  public involvesToken(token: Token): boolean {
    return token.equals(this.token0) || token.equals(this.token1)
  }

  /**
   * Returns the current mid price of the pair in terms of token0, i.e. the ratio of reserve1 to reserve0
   */
  public get token0Price(): Price {
    return new Price(this.token0, this.token1, this.tokenAmounts[0].raw, this.tokenAmounts[1].raw)
  }

  /**
   * Returns the current mid price of the pair in terms of token1, i.e. the ratio of reserve0 to reserve1
   */
  public get token1Price(): Price {
    return new Price(this.token1, this.token0, this.tokenAmounts[1].raw, this.tokenAmounts[0].raw)
  }

  /**
   * Return the price of the given token in terms of the other token in the pair.
   * @param token token to return price of
   */
  public priceOf(token: Token): Price {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.token0Price : this.token1Price
  }

  /**
   * Returns the chain ID of the tokens in the pair.
   */
  public get chainId(): ChainId {
    return this.token0.chainId
  }

  public get token0(): Token {
    return this.tokenAmounts[0].token
  }

  public get token1(): Token {
    return this.tokenAmounts[1].token
  }

  public get reserve0(): TokenAmount {
    return this.tokenAmounts[0]
  }

  public get reserve1(): TokenAmount {
    return this.tokenAmounts[1]
  }

  public reserveOf(token: Token): TokenAmount {
    invariant(this.involvesToken(token), 'TOKEN')
    return token.equals(this.token0) ? this.reserve0 : this.reserve1
  }

  public getOutputAmount(inputAmount: TokenAmount): [TokenAmount, Pair] {
    invariant(this.involvesToken(inputAmount.token), 'TOKEN')
    if (JSBI.equal(this.reserve0.raw, ZERO) || JSBI.equal(this.reserve1.raw, ZERO)) {
      throw new InsufficientReservesError()
    }
    const inputReserve = this.reserveOf(inputAmount.token)
    const outputReserve = this.reserveOf(inputAmount.token.equals(this.token0) ? this.token1 : this.token0)
    const inputAmountWithFee = JSBI.multiply(inputAmount.raw, _998)
    const numerator = JSBI.multiply(inputAmountWithFee, outputReserve.raw)
    const denominator = JSBI.add(JSBI.multiply(inputReserve.raw, _1000), inputAmountWithFee)
    const outputAmount = new TokenAmount(
      inputAmount.token.equals(this.token0) ? this.token1 : this.token0,
      JSBI.divide(numerator, denominator)
    )
    if (JSBI.equal(outputAmount.raw, ZERO)) {
      throw new InsufficientInputAmountError()
    }
    return [outputAmount, new Pair(inputReserve.add(inputAmount), outputReserve.subtract(outputAmount))]
  }

  public getInputAmount(outputAmount: TokenAmount): [TokenAmount, Pair] {
    invariant(this.involvesToken(outputAmount.token), 'TOKEN')
    if (
      JSBI.equal(this.reserve0.raw, ZERO) ||
      JSBI.equal(this.reserve1.raw, ZERO) ||
      JSBI.greaterThanOrEqual(outputAmount.raw, this.reserveOf(outputAmount.token).raw)
    ) {
      throw new InsufficientReservesError()
    }

    const outputReserve = this.reserveOf(outputAmount.token)
    const inputReserve = this.reserveOf(outputAmount.token.equals(this.token0) ? this.token1 : this.token0)
    const numerator = JSBI.multiply(JSBI.multiply(inputReserve.raw, outputAmount.raw), _1000)
    const denominator = JSBI.multiply(JSBI.subtract(outputReserve.raw, outputAmount.raw), _998)
    const inputAmount = new TokenAmount(
      outputAmount.token.equals(this.token0) ? this.token1 : this.token0,
      JSBI.add(JSBI.divide(numerator, denominator), ONE)
    )
    return [inputAmount, new Pair(inputReserve.add(inputAmount), outputReserve.subtract(outputAmount))]
  }

  public getLiquidityMinted(
    totalSupply: TokenAmount,
    tokenAmountA: TokenAmount,
    tokenAmountB: TokenAmount
  ): TokenAmount {
    invariant(totalSupply.token.equals(this.liquidityToken), 'LIQUIDITY')
    const tokenAmounts = tokenAmountA.token.sortsBefore(tokenAmountB.token) // does safety checks
      ? [tokenAmountA, tokenAmountB]
      : [tokenAmountB, tokenAmountA]
    invariant(tokenAmounts[0].token.equals(this.token0) && tokenAmounts[1].token.equals(this.token1), 'TOKEN')

    let liquidity: JSBI
    if (JSBI.equal(totalSupply.raw, ZERO)) {
      liquidity = JSBI.subtract(sqrt(JSBI.multiply(tokenAmounts[0].raw, tokenAmounts[1].raw)), MINIMUM_LIQUIDITY)
    } else {
      const amount0 = JSBI.divide(JSBI.multiply(tokenAmounts[0].raw, totalSupply.raw), this.reserve0.raw)
      const amount1 = JSBI.divide(JSBI.multiply(tokenAmounts[1].raw, totalSupply.raw), this.reserve1.raw)
      liquidity = JSBI.lessThanOrEqual(amount0, amount1) ? amount0 : amount1
    }
    if (!JSBI.greaterThan(liquidity, ZERO)) {
      throw new InsufficientInputAmountError()
    }
    return new TokenAmount(this.liquidityToken, liquidity)
  }

  public getLiquidityValue(
    token: Token,
    totalSupply: TokenAmount,
    liquidity: TokenAmount,
    feeOn: boolean = false,
    kLast?: BigintIsh
  ): TokenAmount {
    invariant(this.involvesToken(token), 'TOKEN')
    invariant(totalSupply.token.equals(this.liquidityToken), 'TOTAL_SUPPLY')
    invariant(liquidity.token.equals(this.liquidityToken), 'LIQUIDITY')
    invariant(JSBI.lessThanOrEqual(liquidity.raw, totalSupply.raw), 'LIQUIDITY')

    let totalSupplyAdjusted: TokenAmount
    if (!feeOn) {
      totalSupplyAdjusted = totalSupply
    } else {
      invariant(!!kLast, 'K_LAST')
      const kLastParsed = parseBigintIsh(kLast)
      if (!JSBI.equal(kLastParsed, ZERO)) {
        const rootK = sqrt(JSBI.multiply(this.reserve0.raw, this.reserve1.raw))
        const rootKLast = sqrt(kLastParsed)
        if (JSBI.greaterThan(rootK, rootKLast)) {
          const numerator = JSBI.multiply(totalSupply.raw, JSBI.subtract(rootK, rootKLast))
          const denominator = JSBI.add(JSBI.multiply(rootK, FIVE), rootKLast)
          const feeLiquidity = JSBI.divide(numerator, denominator)
          totalSupplyAdjusted = totalSupply.add(new TokenAmount(this.liquidityToken, feeLiquidity))
        } else {
          totalSupplyAdjusted = totalSupply
        }
      } else {
        totalSupplyAdjusted = totalSupply
      }
    }

    return new TokenAmount(
      token,
      JSBI.divide(JSBI.multiply(liquidity.raw, this.reserveOf(token).raw), totalSupplyAdjusted.raw)
    )
  }

  public async getLiquidityInfoOf(address: string): Promise<LiquidityInfoOf> {
    const [totalSupply, userLiquidity] = await Promise.all([
      this.liquidityToken.totalSupply(),
      this.liquidityToken.balanceOf(address),
    ])
    const reserves: [TokenAmount, TokenAmount] = [this.reserveOf(this.token0), this.reserveOf(this.token1)]
    const liquidityAmountToken0 = this.getLiquidityValue(this.token0, totalSupply, userLiquidity)
    const liquidityAmountToken1 = this.getLiquidityValue(this.token1, totalSupply, userLiquidity)
    return { totalSupply, userLiquidity, reserves, liquidityAmountToken0, liquidityAmountToken1 }
  }

  public async getRemoveLiquidityAmounts(percentAmount: string, liquidityInfo: LiquidityInfoOf): Promise<RemoveLiquidityAmounts> {
    const { userLiquidity, liquidityAmountToken0, liquidityAmountToken1 } = liquidityInfo
    const percent = new Percent(percentAmount, '100')
    const liquidityAmountTokenToRemove = new TokenAmount(this.liquidityToken, percent.multiply(userLiquidity.raw).quotient)
    return {
      liquidityAmountToken0ToRemove: new TokenAmount(liquidityAmountToken0.token, percent.multiply(liquidityAmountToken0.raw).quotient),
      liquidityAmountToken1ToRemove: new TokenAmount(liquidityAmountToken1.token, percent.multiply(liquidityAmountToken1.raw).quotient),
      liquidityAmountTokenToRemove,
      percent
    }
  }

  public async removeLiquidiy(privateKey: string, removeLiquidityAmounts: RemoveLiquidityAmounts) {
    const gasPrice: string = '0x37E11D600'
    const gasLimit: string = '0x989680'
    const chainId = this.chainId
    const ttl = 60 * 20
    const deadline = `0x${(Math.floor(new Date().getTime() / 1000) + ttl).toString(16)}`
    const routerContract = getRouterContract(chainId, privateKey)
    const recipient = await routerContract.signer.getAddress()
    const { liquidityAmountToken0ToRemove, liquidityAmountToken1ToRemove, liquidityAmountTokenToRemove } = removeLiquidityAmounts

    const minAmountToken0 = liquidityAmountToken0ToRemove.getMinAmount()
    const minAmountToken1 = liquidityAmountToken1ToRemove.getMinAmount()

    const args = [
      this.token0.address,
      this.token1.address,
      liquidityAmountTokenToRemove.raw.toString(),
      minAmountToken0.raw.toString(),
      minAmountToken1.raw.toString(),
      recipient,
      deadline
    ]

    try {
      await approveToken(liquidityAmountTokenToRemove, privateKey)
    } catch (error) {
      throw new Error('Failed to approve token')
    }

    let method = routerContract.removeLiquidity
    let estimate = routerContract.estimateGas.removeLiquidity
    let estimateGasLimit = null
    try {
      const estimatedGasLimit = await estimate(...args, {})
      estimateGasLimit = estimatedGasLimit.mul(BigNumber.from(10000).add(BigNumber.from(1000))).div(BigNumber.from(10000))
    } catch (error) { }

    return method(...args, {
      ...(estimateGasLimit ? { gasLimit: estimateGasLimit } : { gasPrice, gasLimit })
    })
  }

  public async addLiquidity(privateKey: string) {
    const gasPrice: string = '0x37E11D600'
    const gasLimit: string = '0x989680'
    const chainId = this.chainId
    const ttl = 60 * 20
    const deadline = `0x${(Math.floor(new Date().getTime() / 1000) + ttl).toString(16)}`
    const routerContract = getRouterContract(chainId, privateKey)
    const recipient = await routerContract.signer.getAddress()

    const minAmountToken0 = JSBI.divide(JSBI.multiply(this.reserve0.raw, JSBI.BigInt(10000 - 80)), JSBI.BigInt(10000))
    const minAmountToken1 = JSBI.divide(JSBI.multiply(this.reserve1.raw, JSBI.BigInt(10000 - 80)), JSBI.BigInt(10000))

    try {
      await approveToken(this.reserve0, privateKey)
      await approveToken(this.reserve1, privateKey)
    } catch (error) {
      throw new Error('Failed to approve token')
    }

    let method = routerContract.addLiquidity
    let estimate = routerContract.estimateGas.addLiquidity
    let estimateGasLimit = null
    let args = []
    let value = null
    if (this.reserve0.currency === ETHER || this.reserve1.currency === ETHER) {
      const token1IsETH = this.reserve1.currency === ETHER
      method = routerContract.addLiquidityETH
      estimate = routerContract.estimateGas.addLiquidityETH

      args = [
        (token1IsETH ? this.token0 : this.token1)?.address ?? '', // token
        (token1IsETH ? this.reserve0 : this.reserve1).raw.toString(), // token desired
        (token1IsETH ? minAmountToken0 : minAmountToken1).toString(), // token min
        (token1IsETH ? minAmountToken1 : minAmountToken0).toString(), // eth min
        recipient,
        deadline,
      ]
      value = `0x${(token1IsETH ? this.reserve0 : this.reserve1).raw.toString(16)}`
    } else {
      args = [
        this.token0.address,
        this.token1.address,
        this.reserve0.raw.toString(),
        this.reserve1.raw.toString(),
        minAmountToken0.toString(),
        minAmountToken1.toString(),
        recipient,
        deadline,
      ]
    }

    try {
      const estimatedGasLimit = await estimate(...args, value && !isZero(value) ? { value } : {})
      estimateGasLimit = estimatedGasLimit.mul(BigNumber.from(10000).add(BigNumber.from(1000))).div(BigNumber.from(10000))
    } catch (error) { }

    return method(
      ...args,
      {
        ...(estimateGasLimit ? { gasLimit: estimateGasLimit } : { gasPrice, gasLimit }),
        ...(value && !isZero(value) ? { value } : {})
      }
    )
  }
}
