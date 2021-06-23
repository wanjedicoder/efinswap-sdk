import invariant from 'tiny-invariant'
import ethers from "ethers";
import { BigNumber } from '@ethersproject/bignumber'
import { ChainId } from '../constants'
import { validateAndParseAddress } from '../utils'
import { getProvider, getContract } from '../getContract'
import { abi as IUniswapV2PairABI } from '../abis/IUniswapV2Pair.json'
import { TokenAmount } from './fractions/tokenAmount'
import { Currency } from './currency'

/**
 * Represents an ERC20 token with a unique address and some metadata.
 */
export class Token extends Currency {
  public readonly chainId: ChainId
  public readonly address: string
  public readonly contract: ethers.Contract

  public constructor(chainId: ChainId, address: string, decimals: number, symbol?: string, name?: string) {
    super(decimals, symbol, name)
    this.chainId = chainId
    this.address = validateAndParseAddress(address)
    this.contract = getContract(this.address, IUniswapV2PairABI, getProvider(this.chainId))
  }

  /**
   * Returns true if the two tokens are equivalent, i.e. have the same chainId and address.
   * @param other other token to compare
   */
  public equals(other: Token): boolean {
    // short circuit on reference equality
    if (this === other) {
      return true
    }
    return this.chainId === other.chainId && this.address === other.address
  }

  /**
   * Returns true if the address of this token sorts before the address of the other token
   * @param other other token to compare
   * @throws if the tokens have the same address
   * @throws if the tokens are on different chains
   */
  public sortsBefore(other: Token): boolean {
    invariant(this.chainId === other.chainId, 'CHAIN_IDS')
    invariant(this.address !== other.address, 'ADDRESSES')
    return this.address.toLowerCase() < other.address.toLowerCase()
  }

  public async totalSupply(): Promise<TokenAmount> {
    const amount = await this.contract.totalSupply()
    return new TokenAmount(this, amount)
  }

  public async getReserves(): Promise<[BigNumber, BigNumber]> {
    return this.contract.getReserves()
  }

  public async balanceOf(address: string): Promise<TokenAmount> {
    const amount = await this.contract.balanceOf(address)
    return new TokenAmount(this, amount)
  }
}

/**
 * Compares two currencies for equality
 */
export function currencyEquals(currencyA: Currency, currencyB: Currency): boolean {
  if (currencyA instanceof Token && currencyB instanceof Token) {
    return currencyA.equals(currencyB)
  } else if (currencyA instanceof Token) {
    return false
  } else if (currencyB instanceof Token) {
    return false
  } else {
    return currencyA === currencyB
  }
}


export const WETH = {
  [ChainId.MAINNET]: new Token(
    ChainId.MAINNET,
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    18,
    'WBNB',
    'Wrapped BNB'
  ),
  [ChainId.BSCTESTNET]: new Token(
    ChainId.BSCTESTNET,
    '0xd66c6B4F0be8CE5b39D52E0Fd1344c389929B378',
    18,
    'WBNB',
    'Wrapped BNB'
  )
}

