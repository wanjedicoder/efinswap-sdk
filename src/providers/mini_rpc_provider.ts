import fetch from "node-fetch";
import { ExternalProvider } from '@ethersproject/providers'
import { ChainId } from '../constants'

// taken from ethers.js, compatible interface with web3 provider
type AsyncSendable = {
  isMetaMask?: boolean
  host?: string
  path?: string
  sendAsync?: (request: any, callback: (error: any, response: any) => void) => void
  send?: (request: any, callback: (error: any, response: any) => void) => void
}

interface BatchItem {
  request: { jsonrpc: '2.0'; id: number; method: string; params: unknown }
  resolve: (result: any) => void
  reject: (error: Error) => void
}

class RequestError extends Error {
  constructor(message: string, public code: number, public data?: unknown) {
    super(message)
  }
}

export default class MiniRpcProvider implements AsyncSendable, ExternalProvider {
  public readonly isMetaMask: false = false

  public readonly chainId: ChainId

  public readonly url: string

  public readonly host: string

  public readonly path: string

  public readonly batchWaitTimeMs: number

  private nextId = 1

  private batchTimeoutId: ReturnType<typeof setTimeout> | null = null

  private batch: BatchItem[] = []

  constructor(chainId: ChainId, url: string, batchWaitTimeMs?: number) {
    this.chainId = chainId
    this.url = url
    const parsed = new URL(url)
    this.host = parsed.host
    this.path = parsed.pathname
    // how long to wait to batch calls
    this.batchWaitTimeMs = batchWaitTimeMs ?? 50
  }

  public readonly clearBatch = async () => {
    const { batch } = this
    this.batch = []
    this.batchTimeoutId = null
    let response: any
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch.map((item) => item.request)),
      })
    } catch (error) {
      console.log(error)
      batch.forEach(({ reject }) => reject(new Error('Failed to send batch call')))
      return
    }

    if (!response.ok) {
      batch.forEach(({ reject }) => reject(new RequestError(`${response.status}: ${response.statusText}`, -32000)))
      return
    }

    let json
    try {
      json = await response.json()
      // console.group('Response')
      // console.log(`Clearing batch | url: ${this.url} body: ${JSON.stringify(batch.map((item) => item.request))}`)
      // console.log(json)
      // console.groupEnd()
    } catch (error) {
      batch.forEach(({ reject }) => reject(new Error('Failed to parse JSON response')))
      return
    }
    const byKey = batch.reduce<{ [id: number]: BatchItem }>((memo, current) => {
      memo[current.request.id] = current
      return memo
    }, {})
    // eslint-disable-next-line no-restricted-syntax
    for (const result of json) {
      const {
        resolve,
        reject,
        request: { method },
      } = byKey[result.id]
      if (resolve && reject) {
        if ('error' in result) {
          reject(new RequestError(result?.error?.message, result?.error?.code, result?.error?.data))
        } else if ('result' in result) {
          resolve(result.result)
        } else {
          reject(new RequestError(`Received unexpected JSON-RPC response to ${method} request.`, -32000, result))
        }
      }
    }
  }

  public readonly sendAsync = (
    request: { method: string; params?: any },
    callback: (error: any, response: any) => void
  ): void => {
    this.request(request)
      .then((result) => callback(null, { jsonrpc: '2.0', result }))
      .catch((error) => callback(error, null))
  }

  public readonly request = async (request: {
    method: string;
    params?: Array<any>;
  }): Promise<any> => {
    const { params, method } = request
    // if (typeof method !== 'string') {
    //   return this.request(method.method, method.params)
    // }
    if (method === 'eth_chainId') {
      return `0x${this.chainId.toString(16)}`
    }
    const promise = new Promise((resolve, reject) => {
      this.batch.push({
        request: {
          jsonrpc: '2.0',
          id: this.nextId++,
          method,
          params,
        },
        resolve,
        reject,
      })
    })
    this.batchTimeoutId = this.batchTimeoutId ?? setTimeout(this.clearBatch, this.batchWaitTimeMs)
    return promise
  }
}
