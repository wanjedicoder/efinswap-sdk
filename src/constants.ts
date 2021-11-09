import JSBI from 'jsbi'

// exports for external consumption
export type BigintIsh = JSBI | bigint | string

export enum ChainId {
  MAINNET = 56,
  BSCTESTNET = 97
}

export enum TradeType {
  EXACT_INPUT,
  EXACT_OUTPUT
}

export enum Rounding {
  ROUND_DOWN,
  ROUND_HALF_UP,
  ROUND_UP
}

export const FACTORY_ADDRESS = '0xBCfCcbde45cE874adCB698cC183deBcF17952812'
export const FACTORY_ADDRESS_BY_CHAIN = {
  [ChainId.MAINNET]: '0x3b5238312DcBb5ADEdA7470109e60c39CF9ad406',
  [ChainId.BSCTESTNET]: '0xCc261efd1946f1810959B2cbbDbD7057d39b0FCa'
}

export const ROUTER_ADDRESS_BY_CHAIN = {
  [ChainId.MAINNET]: '0x827BDb822940198F22FA984c5645a27C60E6Bb5B',
  [ChainId.BSCTESTNET]: '0x32D6A78deBEC40A8b32A0Cb95Fc60524b14389B0'
}

export const INIT_CODE_HASH_BY_CHAIN = {
  [ChainId.MAINNET]: '0xba5060bb7d8f2c95e85e0e8a580390ff7bccccd895254636d87d526c1753fcd3',
  [ChainId.BSCTESTNET]: '0x825f7bd3f5deccab4ef9adb06501a35e8df4a3b46346c6a067612ea19b9696e2'
}

export const RPC_URL = {
  [ChainId.MAINNET]: 'https://bsc-dataseed.binance.org/',
  [ChainId.BSCTESTNET]: 'https://data-seed-prebsc-1-s1.binance.org:8545/'
}

export const INIT_CODE_HASH = '0xd0d4c4cd0848c93cb4fd1f498d7013ee6bfb25783ea21593d5834f5d250ece66'

export const MINIMUM_LIQUIDITY = JSBI.BigInt(1000)

// exports for internal consumption
export const ZERO = JSBI.BigInt(0)
export const ONE = JSBI.BigInt(1)
export const TWO = JSBI.BigInt(2)
export const THREE = JSBI.BigInt(3)
export const FIVE = JSBI.BigInt(5)
export const TEN = JSBI.BigInt(10)
export const _100 = JSBI.BigInt(100)
export const _998 = JSBI.BigInt(998)
export const _1000 = JSBI.BigInt(1000)

export enum SolidityType {
  uint8 = 'uint8',
  uint256 = 'uint256'
}

export const SOLIDITY_TYPE_MAXIMA = {
  [SolidityType.uint8]: JSBI.BigInt('0xff'),
  [SolidityType.uint256]: JSBI.BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
}


export const GAS_PRICE = '0x12A05F200' // 5000000000 - 5 gwei
export const GAS_LIMIT = '0xD6D8' // 55000