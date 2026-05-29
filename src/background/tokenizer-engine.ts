import { init } from '@dqbd/tiktoken/init'
import { get_encoding, type Tiktoken, type TiktokenEncoding } from '@dqbd/tiktoken'
import type { PlatformName } from '../shared/types'

const ENCODING_MAP: Record<PlatformName, TiktokenEncoding> = {
  deepseek: 'cl100k_base',
  yiyan: 'cl100k_base',
  tongyi: 'cl100k_base',
  doubao: 'cl100k_base',
  moonshot: 'cl100k_base',
}

export class TokenizerEngine {
  private initialized = false
  private encoders = new Map<TiktokenEncoding, Tiktoken>()
  private lastUsed = new Map<TiktokenEncoding, number>()

  async init(wasmSource?: ArrayBuffer) {
    if (this.initialized) return
    if (wasmSource) {
      await init(async (imports) => {
        return WebAssembly.instantiate(wasmSource, imports)
      })
    }
    this.initialized = true
  }

  async getEncoder(platform: PlatformName) {
    const encodingName = ENCODING_MAP[platform]
    if (!this.encoders.has(encodingName)) {
      const encoder = get_encoding(encodingName)
      this.encoders.set(encodingName, encoder)
    }
    this.lastUsed.set(encodingName, Date.now())
    return this.encoders.get(encodingName)!
  }

  countTokens(text: string, platform: PlatformName): number {
    const encoder = this.encoders.get(ENCODING_MAP[platform])
    if (!encoder) {
      return new TextEncoder().encode(text).length
    }
    return encoder.encode(text).length
  }

  cleanup(idleMs = 5 * 60 * 1000) {
    const now = Date.now()
    for (const [name, lastUsed] of this.lastUsed) {
      if (now - lastUsed > idleMs) {
        this.encoders.delete(name)
        this.lastUsed.delete(name)
      }
    }
  }
}
