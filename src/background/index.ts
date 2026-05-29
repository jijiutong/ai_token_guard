import { TokenStore } from './token-store'
import { QuotaManager } from './quota-manager'
import type { MessageRequest, MessageResponse, PlatformName } from '../shared/types'

const store = new TokenStore()
const quotaManager = new QuotaManager()

// Offscreen document URL
const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen/index.html')
let offscreenReady = false
let offscreenCreating = false

async function broadcastStatsCleared(scope: 'platform' | 'all', platform?: PlatformName) {
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (!tab.id) continue
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'stats_cleared_notify',
        scope,
        platform,
      })
    } catch {
      // ignore tabs without injected content scripts
    }
  }
}

async function createOffscreenDocument() {
  if (offscreenReady) return
  if (offscreenCreating) {
    while (!offscreenReady) await new Promise(r => setTimeout(r, 100))
    return
  }

  offscreenCreating = true
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['LOCAL_STORAGE'],
      justification: 'Token counting via tiktoken WASM',
    })
    console.log('[AI Token Guard] Offscreen created, waiting for WASM...')
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('Only a single offscreen')) {
      console.log('[AI Token Guard] Offscreen already exists')
    } else {
      console.error('[AI Token Guard] Failed to create offscreen:', err)
      offscreenCreating = false
      return
    }
  }

  for (let i = 0; i < 30; i++) {
    try {
      const result = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: 'offscreen:ready_ping' }, (resp) => resolve(resp))
      })
      if (result) {
        offscreenReady = true
        console.log('[AI Token Guard] Offscreen ready')
        break
      }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 200))
  }

  if (!offscreenReady) console.warn('[AI Token Guard] Offscreen not ready after 6s')
  offscreenCreating = false
}

async function offscreenCountTokens(text: string, platform: PlatformName): Promise<number> {
  await createOffscreenDocument()
  if (!offscreenReady) throw new Error('Offscreen not ready')

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'offscreen:count_tokens', data: { text, platform } },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
        if (response?.error) { reject(new Error(response.error)); return }
        resolve(response?.count ?? 0)
      }
    )
  })
}

chrome.runtime.onMessage.addListener(
  (request: MessageRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => {
    handleRequest(request).then(sendResponse)
    return true
  }
)

async function handleRequest(request: MessageRequest): Promise<MessageResponse> {
  await store.load()
  await quotaManager.load()

  switch (request.type) {
    case 'count_tokens': {
      const count = await offscreenCountTokens(request.text, request.platform)
      return { type: 'token_count', data: { totalTokens: count, inputTokens: count, outputTokens: 0, reasoningTokens: 0, cacheHitTokens: 0 } }
    }
    case 'record_token_usage': {
      const session = request.sessionId
        ? store.recordUsage(request.sessionId, {
            inputTokens: request.inputTokens,
            outputTokens: request.outputTokens,
            contextWindowTokens: request.contextWindowTokens,
          })
        : store.recordUsage(store.getOrCreateSession(request.platform).sessionId, {
            inputTokens: request.inputTokens,
            outputTokens: request.outputTokens,
            contextWindowTokens: request.contextWindowTokens,
          })

      if (!session) return { type: 'error', message: 'Session not found' }

      await store.save()
      const todayStatsV2 = store.getTodayStatsV2()
      quotaManager.checkQuota(todayStatsV2.overview.totalTokens, todayStatsV2.byPlatform)
      return { type: 'usage_recorded', data: session }
    }
    case 'count_baseline_tokens': {
      const rawCount = await offscreenCountTokens(request.text, request.platform)
      const tokens = rawCount + request.systemBase + request.templateOverhead
      const session = store.getActiveSession(request.platform)
      if (session) {
        store.setContextWindow(session.sessionId, tokens)
        await store.save()
        const todayStatsV2 = store.getTodayStatsV2()
        quotaManager.checkQuota(todayStatsV2.overview.totalTokens, todayStatsV2.byPlatform)
      }
      return { type: 'baseline_token_count', data: { tokens } }
    }
    case 'get_session_id': {
      const session = store.getOrCreateSession(request.platform, request.conversationKey)
      return { type: 'session_id', data: { sessionId: session.sessionId, session } }
    }
    case 'start_session': {
      const session = store.getOrCreateSession(request.platform, request.conversationKey)
      return { type: 'session_id', data: { sessionId: session.sessionId, session } }
    }
    case 'get_daily_stats':
      return { type: 'daily_stats', data: store.getTodayStats() }
    case 'get_daily_stats_v2':
      return { type: 'daily_stats_v2', data: store.getTodayStatsV2() }
    case 'get_last24h_stats':
      return { type: 'last24h_stats', data: store.getLast24hStats() }
    case 'get_last24h_stats_v2':
      return { type: 'last24h_stats_v2', data: store.getLast24hStatsV2() }
    case 'clear_platform_stats': {
      await store.clearPlatformStats(request.platform)
      await broadcastStatsCleared('platform', request.platform)
      return { type: 'stats_cleared', data: { scope: 'platform', platform: request.platform } }
    }
    case 'clear_all_stats': {
      await store.clearAllStats()
      await broadcastStatsCleared('all')
      return { type: 'stats_cleared', data: { scope: 'all' } }
    }
    case 'get_quota_config':
      return { type: 'quota_config', data: quotaManager.getConfig() }
    case 'update_quota_config':
      await quotaManager.updateConfig(request.config)
      return { type: 'quota_config_updated', data: quotaManager.getConfig() }
    default:
      return { type: 'error', message: 'Unknown request type' }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Token Guard installed')
})
