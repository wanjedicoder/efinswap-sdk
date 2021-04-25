import { isAddress } from '@ethersproject/address'
import { AddressZero } from '@ethersproject/constants'
import ethers from "ethers";
import { abi as IUniswapV2Router02ABI } from './abis/IUniswapV2Router02.json'
import { ChainId, ROUTER_ADDRESS_BY_CHAIN, RPC_URL } from './constants'
import MiniRpcProvider from './providers/mini_rpc_provider'


type Web3Provider = ethers.providers.Web3Provider


export function getProvider(chainId: ChainId): Web3Provider {
  const provider = new MiniRpcProvider(
    chainId,
    RPC_URL[chainId],
    1000
  );
  return new ethers.providers.Web3Provider(provider);
}


// account is not optional
export function getSigner(library: Web3Provider, privateKey: string): ethers.Wallet {
  const walletMnemonic = ethers.Wallet.fromMnemonic(privateKey)
  var wallet = new ethers.Wallet(walletMnemonic.privateKey);
  const newWallet = wallet.connect(library);
  return newWallet
}

// account is optional
export function getProviderOrSigner(library: Web3Provider, privateKey?: string): Web3Provider | ethers.Wallet {
  return privateKey ? getSigner(library, privateKey) : library
}

// account is optional
export function getContract(address: string, ABI: any, library: Web3Provider, privateKey?: string): ethers.Contract {
  if (!isAddress(address) || address === AddressZero) {
    throw Error(`Invalid 'address' parameter '${address}'.`)
  }

  return new ethers.Contract(address, ABI, getProviderOrSigner(library, privateKey))
}

// account is optional
export function getRouterContract(chainId: ChainId, privateKey?: string, library = getProvider(chainId)): ethers.Contract {
  return getContract(ROUTER_ADDRESS_BY_CHAIN[chainId], IUniswapV2Router02ABI, library, privateKey)
}
