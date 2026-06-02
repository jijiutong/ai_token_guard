/**
 * Offscreen document for tiktoken WASM initialization.
 * This runs in a regular document context (not Service Worker),
 * so CSP allows 'wasm-eval'.
 */

import { init } from '@dqbd/tiktoken/init'
import { get_encoding, type Tiktoken, type TiktokenEncoding } from '@dqbd/tiktoken'
import wasmAssetUrl from '@dqbd/tiktoken/tiktoken_bg.wasm?url'
import type { PlatformName } from '../shared/types'

const ENCODING_MAP: Record<PlatformName, TiktokenEncoding> = {
  deepseek: 'cl100k_base',
  yiyan: 'cl100k_base',
  tongyi: 'cl100k_base',
  doubao: 'cl100k_base',
  moonshot: 'cl100k_base',
}

interface TokenizerState {
  ready: boolean
  encoders: Map<TiktokenEncoding, Tiktoken>
  lastUsed: Map<TiktokenEncoding, number>
}

const tokenizer: TokenizerState = {
  ready: false,
  encoders: new Map(),
  lastUsed: new Map(),
}

let initInFlight: Promise<void> | null = null

async function initTokenizer(force = false) {
  if (tokenizer.ready && !force) return
  if (initInFlight && !force) {
    await initInFlight
    return
  }
  if (force) {
    tokenizer.ready = false
    tokenizer.encoders.clear()
    tokenizer.lastUsed.clear()
  }

  initInFlight = (async () => {
    const normalizedAssetPath = wasmAssetUrl.startsWith('/') ? wasmAssetUrl.slice(1) : wasmAssetUrl
    const wasmUrl = chrome.runtime.getURL(normalizedAssetPath)
    const response = await fetch(wasmUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`)
    }
    const wasmBuffer = await response.arrayBuffer()
    await init(async (imports) => WebAssembly.instantiate(wasmBuffer, imports))
    tokenizer.ready = true
  })()

  try {
    await initInFlight
  } finally {
    initInFlight = null
  }

  tokenizer.ready = true
}

function countTokens(text: string, platform: PlatformName): number {
  const encodingName = ENCODING_MAP[platform]
  if (!tokenizer.encoders.has(encodingName)) {
    const encoder = get_encoding(encodingName)
    tokenizer.encoders.set(encodingName, encoder)
  }
  tokenizer.lastUsed.set(encodingName, Date.now())
  return tokenizer.encoders.get(encodingName)!.encode(text).length
}

function cleanupEncoders(idleMs = 5 * 60 * 1000) {
  const now = Date.now()
  for (const [name, lastUsed] of tokenizer.lastUsed) {
    if (now - lastUsed > idleMs) {
      tokenizer.encoders.delete(name)
      tokenizer.lastUsed.delete(name)
    }
  }
}

// Listen for messages from Service Worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'offscreen:ready_ping') {
    sendResponse({ ready: tokenizer.ready })
    return
  }
  if (message.type === 'offscreen:count_tokens') {
    handleCountTokens(message.data)
      .then((result) => {
        sendResponse(result)
      })
      .catch((err) => {
        console.error('[AI Token Guard Offscreen] Error:', err)
        sendResponse({ error: err.message })
      })
    return true
  }
})

async function handleCountTokens(data: { text: string; platform: PlatformName }) {
  if (!tokenizer.ready) {
    await initTokenizer()
  }
  try {
    const count = countTokens(data.text, data.platform)
    return { count }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isWasmMemoryCrash = /memory access out of bounds/i.test(message)
    if (!isWasmMemoryCrash) throw error
    console.warn('[AI Token Guard Offscreen] WASM memory crash, reinitializing tokenizer...')
    await initTokenizer(true)
    const count = countTokens(data.text, data.platform)
    return { count }
  }
}

// Periodic cleanup
setInterval(cleanupEncoders, 5 * 60 * 1000)

// Initialize on load
initTokenizer().catch((err) => {
  console.error('[AI Token Guard Offscreen] Tokenizer init failed:', err)
})
