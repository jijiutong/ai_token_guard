import { isTargetPlatform } from './platform-detector'
import { DomObserver } from './dom-observer'
import { FloatingBar } from './floating-bar'
import { buildAssistantText, buildContextText, collectAssistantTexts, collectConversationMessages } from './context-counter'
import { mergeContextHistorySample, restoreContextHistoryFromWindow, type ContextHistoryState } from './context-history'
import { createOutputSignature, getAppendOnlyDelta, getTailWindowDelta, hashString } from './output-delta'
import {
  stripLeadingUserEcho,
  stripAtgStatsEchoText,
  shouldAllowAwaitingResetNoDelta,
  shouldAttemptOutputSelfHeal,
} from './output-cleanup'
import {
  hasResolvedSessionKey,
  resolveConversationKeyForState,
  shouldCheckEmptyConversationReset,
} from './session-reset'
import { debounce } from '../shared/utils'
import { getLocalDayKey } from '../shared/day-key'
import type { MessageRequest, MessageResponse, TokenCount, PlatformName, SessionState } from '../shared/types'
import { getStrategyByHostname } from './platform-strategy'

export {}

const hostname = window.location.hostname

/** System prompt base tokens per platform */
const SYSTEM_PROMPT_BASE: Record<PlatformName, number> = {
  deepseek: 120,
  yiyan: 150,
  tongyi: 100,
  doubao: 130,
  moonshot: 100,
}

const CHAT_TEMPLATE_OVERHEAD = 5

if (isTargetPlatform()) {
  main()
}

function main() {
  let currentPlatform: PlatformName | 'unknown' = 'unknown'
  const TRACE_TAG = '[ATG-TRACE]'
  const traceState = new Map<string, { sig: string; at: number }>()
  const traceThrottleState = new Map<string, number>()
  const publishBridgeState = (state: Record<string, unknown>) => {
    ;(window as unknown as { __ATG_State?: Record<string, unknown> }).__ATG_State = state
    ;(window as unknown as { __ATG_DoubaoState?: Record<string, unknown> }).__ATG_DoubaoState = state
    const json = JSON.stringify(state)
    document.documentElement.setAttribute('data-atg-state', json)
    document.documentElement.setAttribute('data-atg-doubao-state', json)
    document.documentElement.setAttribute(`data-atg-state-${currentPlatform}`, json)
  }

  publishBridgeState({
    at: Date.now(),
    phase: 'boot',
    note: 'content script entered main()',
  })
  const strategyCandidate = getStrategyByHostname(window.location.hostname)
  if (!strategyCandidate) {
    publishBridgeState({
      at: Date.now(),
      phase: 'exit',
      reason: 'hostname_not_supported',
      host: window.location.hostname,
    })
    return
  }
  const strategy = strategyCandidate
  const platform: PlatformName = strategy.platform
  currentPlatform = platform
  const legacyDebugFlag = window.localStorage.getItem('ai-token-guard-debug')
  const logLevel = window.localStorage.getItem('ai-token-guard-log-level') || (legacyDebugFlag === '1' ? 'debug' : legacyDebugFlag || 'off')
  const debugOutput = logLevel === 'debug' || logLevel === 'trace'
  const traceOutput = logLevel === 'trace'
  let lastPollDebugSignature = ''

  function dbg(...args: unknown[]) {
    if (!debugOutput) return
    console.log('[AI Token Guard][platform-debug]', platform, ...args)
  }

  function trace(type: string, data: Record<string, unknown> = {}) {
    if (!traceOutput) return
    const payload = {
      type,
      ts: Date.now(),
      platform,
      convKey: getConversationKey(),
      input: committedInputTokens,
      output: committedOutputTokens,
      session: committedInputTokens + committedOutputTokens,
      context: contextWindowTokens,
      ...data,
    }
    const key = `${type}:${payload.convKey}`
    if (type === 'context_ignored_shrink') {
      const throttleKey = `${key}:throttle`
      const lastAt = traceThrottleState.get(throttleKey) || 0
      if (Date.now() - lastAt < 10000) return
      traceThrottleState.set(throttleKey, Date.now())
    }
    const sig = JSON.stringify({
      type: payload.type,
      platform: payload.platform,
      convKey: payload.convKey,
      input: payload.input,
      output: payload.output,
      context: payload.context,
      data,
    })
    const now = Date.now()
    const prev = traceState.get(key)
    if (prev && prev.sig === sig && now - prev.at < 15000) return
    traceState.set(key, { sig, at: now })
    console.log(TRACE_TAG, payload)
  }

  const domObserver = new DomObserver(strategy)
  const floatingBar = new FloatingBar()
  let barMounted = false
  let extensionContextAlive = true
  let cleanupDone = false
  const intervalIds: number[] = []
  let rejectionHandlerBound = false
  let errorHandlerBound = false

  let currentSessionId = ''
  let committedInputTokens = 0
  let committedOutputTokens = 0
  let lastInputCharCount = 0
  let lastConversationKey = ''
  let lastSubmittedText = ''
  let lastSubmittedAt = 0
  let awaitingAssistantReply = false
  let outputCountedForCurrentReply = false
  let assistantBaselineText = ''
  let assistantBaselineList: string[] = []
  let assistantLastSeenText = ''
  let assistantLastChangedAt = 0
  let noDeltaPolls = 0
  let stableIdleAssistantTicks = 0
  let lastIdleAssistantText = ''
  let trustedAssistantBaselineText = ''
  let trustedAssistantBaselineList: string[] = []
  let trustedReplyBaselineRaw = ''
  let replyStartAssistantCount = 0
  let replyBaselineAssistantRaw = ''
  let assistantFallbackLastSeenRaw = ''
  let lastCommittedInputText = ''
  const recentCommittedInputs: string[] = []
  let lastInputCommittedAt = 0
  let lastOutputCountedAt = 0
  let lastSelfHealAttemptAt = 0
  let lastConversationFingerprint = ''
  let lastCommitRequestedAt = 0
  const recentInputCommitKeys = new Map<string, number>()
  let awaitingStartedAt = 0
  const countedOutputSignatures = new Set<string>()
  const pendingOutputSignatures = new Set<string>()
  let outputCountInFlight = false
  const platformEventLog: Array<{ at: number; type: string; data?: Record<string, unknown> }> = []
  let contextWindowTokens = SYSTEM_PROMPT_BASE[platform]
  let contextHistoryTokens = 0
  let contextHistoryTurns = 0
  let contextVersion = 0
  let lastContextFingerprint = ''
  let shrinkStableCount = 0
  let lastShrinkSampleTokens = 0
  let shrinkReportFingerprint = ''
  let shrinkReportCount = 0
  let shrinkReportLastAt = 0
  let commitInFlight = false
  let draftConversationNonce = 0
  let conversationKeyLocked = ''
  let lastForcedDraftResetAt = 0
  let hasMountedOnce = false
  let emptyConversationResetCount = 0
  let currentDayKey = getLocalDayKey()

  function hasConversationMessages(): boolean {
    const assistantBlocks = strategy.findAssistantBlocks()
    const messages = collectConversationMessages(strategy.findConversationBlocks(), assistantBlocks)
    const ignored = new Set([
      ...strategy.getIgnoredSnippets(),
      '你好，我是千问',
      '下载客户端体验',
      '新功能',
      '语音输入法上线',
      '内容由ai生成',
      '请注意核实',
    ].map((s) => s.toLowerCase()))
    const meaningful = messages.filter((msg) => {
      const text = (msg.content || '').trim().toLowerCase()
      if (!text || text.length < 3) return false
      if (
        text.includes('深度分析需求并解答') ||
        text.includes('你需要什么帮助') ||
        text.includes('给kimi发送消息')
      ) return false
      for (const snippet of ignored) {
        if (text.includes(snippet)) return false
      }
      return true
    })
    const hasMeaningfulUser = meaningful.some((msg) => msg.role === 'user')
    if (platform === 'deepseek' || platform === 'yiyan' || platform === 'moonshot') {
      // DeepSeek homepage often has assistant-side guide snippets.
      // Yiyan also renders guide/recommendation snippets on new pages.
      // Kimi new-topic pages can also contain starter assistant-side snippets.
      // Treat session as started only after a real user message appears.
      return hasMeaningfulUser
    }
    if (meaningful.length === 0) return false
    if (hasMeaningfulUser) return true
    // Pure welcome/guide assistant block should not be treated as a started session.
    return meaningful.length >= 2
  }

  function getConversationKey(): string {
    if (conversationKeyLocked) return conversationKeyLocked
    conversationKeyLocked = resolveConversationKey()
    return conversationKeyLocked
  }

  function hasResolvedSessionId(baseKey: string): boolean {
    return hasResolvedSessionKey(platform, baseKey)
  }

  function isDraftConversationKey(key: string): boolean {
    return key.includes(':draft:')
  }

  function currentBaseConversationKey(): string {
    return strategy.sessionKeyResolver(
      window.location.hostname,
      window.location.pathname,
      window.location.search,
      window.location.hash
    )
  }

  function resolveConversationKey(): string {
    const baseKey = currentBaseConversationKey()
    return resolveConversationKeyForState({
      platform,
      baseKey,
      hasConversationMessages: hasConversationMessages(),
      now: Date.now(),
      draftConversationNonce,
    })
  }

  function publishPlatformState(extra: Record<string, unknown> = {}) {
    if (extra.reason && typeof extra.reason === 'string') {
      platformEventLog.push({ at: Date.now(), type: extra.reason, data: extra })
      if (platformEventLog.length > 120) platformEventLog.shift()
    }
    const health = evaluatePlatformHealth()
    const state = {
      at: Date.now(),
      platform,
      awaitingAssistantReply,
      outputCountedForCurrentReply,
      committedInputTokens,
      committedOutputTokens,
      contextWindowTokens,
      assistantBaselineLen: assistantBaselineText.length,
      assistantBaselineCount: assistantBaselineList.length,
      replyStartAssistantCount,
      lastOutputCountedAt,
      health,
      eventLogTail: platformEventLog.slice(-20),
      ...extra,
    }
    publishBridgeState(state)
  }

  function evaluatePlatformHealth() {
    const now = Date.now()
    const hasAnyInput = committedInputTokens > 0
    const hasRecentInputCommit = platformEventLog.some((e) => e.type === 'input_committed' && now - e.at < 120000)
    const awaitingTooLong = awaitingAssistantReply && awaitingStartedAt > 0 && now - awaitingStartedAt > 30000
    const outputStallMs = lastInputCommittedAt > 0
      ? now - Math.max(lastInputCommittedAt, lastOutputCountedAt || 0)
      : 0
    const outputLikelyStuck = (
      hasAnyInput &&
      hasRecentInputCommit &&
      committedOutputTokens === 0 &&
      !awaitingAssistantReply &&
      outputStallMs > 12000
    )
    const contextReasonable = contextWindowTokens >= SYSTEM_PROMPT_BASE[platform]
    const ok = !awaitingTooLong && contextReasonable
    return {
      ok,
      awaitingTooLong,
      outputLikelyStuck,
      outputStallMs,
      contextReasonable,
    }
  }

  function normalizeMessageText(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
  }

  function isLikelyPlaceholderInput(text: string): boolean {
    const normalized = normalizeMessageText(text).toLowerCase()
    if (!normalized) return true
    return (
      normalized.includes('你需要什么帮助') ||
      normalized.includes('深度分析需求并解答') ||
      normalized.includes('给kimi发送消息') ||
      normalized.includes('继续追问') ||
      normalized.includes('向千问提问') ||
      normalized.includes('请输入') ||
      normalized.includes('输入问题') ||
      normalized.includes('开始提问') ||
      normalized.includes('有什么可以帮你')
    )
  }

  function hashText(input: string): string {
    return hashString(input)
  }

  function bumpContextHistoryFromCommit(tokenDelta: number, turnDelta: number) {
    if (tokenDelta <= 0 && turnDelta <= 0) return
    applyTrustedContextHistory({
      tokens: Math.max(0, contextHistoryTokens + Math.max(0, tokenDelta)),
      turns: Math.max(0, contextHistoryTurns + Math.max(0, turnDelta)),
      fingerprint: lastContextFingerprint,
    })
  }

  function stripUserEchoFromDelta(delta: string): string {
    const candidates = [
      normalizeMessageText(lastCommittedInputText || ''),
      normalizeMessageText(lastNonEmptyInputText || ''),
      ...recentCommittedInputs.map((text) => normalizeMessageText(text)),
    ]
    return stripLeadingUserEcho(delta, candidates, 3)
  }

  function stripAtgStatsEcho(text: string): string {
    return stripAtgStatsEchoText(text)
  }

  function sanitizeReplyCandidate(text: string): string {
    const noUserEcho = stripUserEchoFromDelta(text)
    const noStatsEcho = stripAtgStatsEcho(noUserEcho)
    return noStatsEcho.trim()
  }

  function normalizeFallbackDelta(delta: string, baselineRaw: string, currentRaw: string): string {
    const clean = delta.trim()
    if (!clean) return ''
    const tooLarge = (
      clean.length > 1200 ||
      clean.length > currentRaw.length * 0.7 ||
      (baselineRaw.length > 0 && clean.length > baselineRaw.length * 0.8)
    )
    if (!tooLarge) return clean

    const tail = getTailWindowDelta(baselineRaw, currentRaw, 24)
    if (tail) return tail

    // Last-resort conservative clip to avoid counting a whole rewritten history block.
    return clean.slice(-240).trim()
  }

  function isSuspiciousFallbackDelta(delta: string, baselineRaw: string, assistantRaw: string): boolean {
    const cleanLen = delta.trim().length
    if (!cleanLen) return true
    if (cleanLen >= 5000) return true
    if (baselineRaw && cleanLen > Math.max(1200, Math.floor(baselineRaw.length * 0.65))) return true
    if (assistantRaw && cleanLen > Math.max(1600, Math.floor(assistantRaw.length * 0.75))) return true
    return false
  }

  function markInputCommittedOnce(conversationKey: string, text: string): boolean {
    const now = Date.now()
    const normalized = normalizeMessageText(text)
    const key = `${conversationKey}:${hashText(normalized)}`
    for (const [k, at] of recentInputCommitKeys) {
      if (now - at > 5000) recentInputCommitKeys.delete(k)
    }
    if (recentInputCommitKeys.has(key)) return false
    recentInputCommitKeys.set(key, now)
    return true
  }

  const handleRuntimeMessage = (
    message: { type?: string; scope?: 'platform' | 'all'; platform?: PlatformName },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    if (!message || message.type !== 'stats_cleared_notify') return false
    const matched = message.scope === 'all' || message.platform === platform
    if (!matched) return false
    draftConversationNonce += 1
    conversationKeyLocked = ''
    resetConversation(true, false, false)
    updateDisplay()
    sendResponse?.({ ok: true })
    return true
  }

  function registerInterval(handler: () => void, ms: number): number {
    const id = window.setInterval(handler, ms)
    intervalIds.push(id)
    return id
  }

  function cleanupRuntime(reason: string) {
    if (cleanupDone) return
    cleanupDone = true
    extensionContextAlive = false
    for (const id of intervalIds) window.clearInterval(id)
    intervalIds.length = 0
    domObserver.disconnect()
    floatingBar.destroy()
    if (rejectionHandlerBound) {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      rejectionHandlerBound = false
    }
    if (errorHandlerBound) {
      window.removeEventListener('error', handleWindowError)
      errorHandlerBound = false
    }
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
    publishBridgeState({
      at: Date.now(),
      phase: 'stopped',
      platform,
      reason,
    })
    console.warn('[AI Token Guard] Stopped content script:', reason)
  }

  function isContextInvalidatedMessage(msg: string): boolean {
    const lower = msg.toLowerCase()
    return (
      lower.includes('extension context invalidated')
    )
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason || '')
    if (!isContextInvalidatedMessage(message)) return
    event.preventDefault()
    cleanupRuntime(message)
  }

  function handleWindowError(event: ErrorEvent) {
    const message = event.message || ''
    if (!isContextInvalidatedMessage(message)) return
    event.preventDefault()
    cleanupRuntime(message)
  }

  function isRuntimeUsable(): boolean {
    try {
      return Boolean(chrome?.runtime?.id)
    } catch {
      return false
    }
  }

  if (!isRuntimeUsable()) {
    publishBridgeState({
      at: Date.now(),
      phase: 'exit',
      reason: 'runtime_unavailable_at_startup',
    })
    console.warn('[AI Token Guard] Runtime unavailable at startup; skip attach')
    return
  }

  /** Send request to Service Worker */
  function sendRequest(request: MessageRequest): Promise<MessageResponse> {
    if (!extensionContextAlive) {
      return Promise.resolve({ type: 'error', message: 'Extension context unavailable' })
    }
    if (!isRuntimeUsable()) {
      publishPlatformState({ reason: 'runtime_unavailable_transient' })
      return Promise.resolve({ type: 'error', message: 'Extension context unavailable' })
    }
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        resolve({ type: 'error', message: `Request timeout: ${request.type}` })
      }, 5000)

      try {
        chrome.runtime.sendMessage(request, (resp: MessageResponse) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const err = chrome.runtime.lastError?.message
          if (err) {
            if (isContextInvalidatedMessage(err)) {
              cleanupRuntime(err)
            }
            resolve({ type: 'error', message: err })
            return
          }
          resolve(resp ?? { type: 'error', message: 'No response' })
        })
      } catch (error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const message = error instanceof Error ? error.message : String(error)
        if (isContextInvalidatedMessage(message)) {
          cleanupRuntime(message)
        }
        resolve({ type: 'error', message })
      }
    })
  }

  if (!rejectionHandlerBound) {
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    rejectionHandlerBound = true
  }
  if (!errorHandlerBound) {
    window.addEventListener('error', handleWindowError)
    errorHandlerBound = true
  }
  chrome.runtime.onMessage.addListener(handleRuntimeMessage)

  /** Count current input tokens (for display only, not accumulated) */
  let currentInputTokenCount = 0
  let inputVersion = 0
  let lastObservedInputText = ''
  let lastNonEmptyInputText = ''
  const countInputTokens = debounce(async (text: string, version: number) => {
    if (version !== inputVersion) return
    if (!text.trim()) {
      lastInputCharCount = 0
      currentInputTokenCount = 0
      updateDisplay()
      updateContextFromParts()
      return
    }
    lastInputCharCount = text.length

    const resp = await sendRequest({
      type: 'count_tokens',
      platform,
      text,
    })

    if (version !== inputVersion) return
    if (resp?.type === 'token_count') {
      currentInputTokenCount = (resp.data as TokenCount).totalTokens
    }
    updateContextFromParts()
  }, 300)

  /** Poll assistant message area for new content */
  function pollAssistantReply() {
    const blocks = strategy.findAssistantBlocks()
    const assistantTexts = collectAssistantTexts(blocks)
    const currentText = assistantTexts.join('\n').trim()
    const now = Date.now()
    const pollSignature = `${blocks.length}|${assistantTexts.length}|${awaitingAssistantReply ? 1 : 0}|${outputCountedForCurrentReply ? 1 : 0}|${currentText.length}|${assistantBaselineText.length}`
    if (pollSignature !== lastPollDebugSignature) {
      lastPollDebugSignature = pollSignature
      dbg('poll', {
        blocks: blocks.length,
        texts: assistantTexts.length,
        awaitingAssistantReply,
        outputCountedForCurrentReply,
        currentLen: currentText.length,
        baselineLen: assistantBaselineText.length,
      })
    }

    if (!currentText) return

    if (!awaitingAssistantReply) {
      if (currentText === lastIdleAssistantText) {
        stableIdleAssistantTicks += 1
      } else {
        lastIdleAssistantText = currentText
        stableIdleAssistantTicks = 0
      }
      if (stableIdleAssistantTicks >= 2) {
        trustedAssistantBaselineText = currentText
        trustedAssistantBaselineList = assistantTexts.slice()
        trustedReplyBaselineRaw = getReplyBaselineAssistantRaw()
      }
    }

    if (currentText !== assistantLastSeenText) {
      assistantLastSeenText = currentText
      assistantLastChangedAt = now
      noDeltaPolls = 0
      return
    }

    if (!awaitingAssistantReply || outputCountedForCurrentReply) return
    if (awaitingStartedAt > 0 && now - awaitingStartedAt > 30000) {
      void maybeForceCommitAssistantOnTimeout(currentText)
      return
    }
    if (now - assistantLastChangedAt < 2500) return

    let delta = getAssistantDeltaByList(assistantBaselineList, assistantTexts)
    if (!delta) {
      const convAssistant = getLatestAssistantTextFromConversation()
      if (convAssistant) {
        const baselineLatest = assistantBaselineList[assistantBaselineList.length - 1]?.trim() || ''
        if (!baselineLatest) {
          delta = convAssistant
        } else if (convAssistant !== baselineLatest) {
          delta = getAppendOnlyDelta(baselineLatest, convAssistant)
          if (!delta && platform === 'doubao') {
            delta = getTailWindowDelta(baselineLatest, convAssistant)
          }
        }
      }
    }
    dbg('delta-calc', {
      baselineLen: assistantBaselineText.length,
      currentLen: currentText.length,
      deltaLen: delta.length,
      lastAssistantLen: (assistantTexts[assistantTexts.length - 1] || '').length,
      baseCount: assistantBaselineList.length,
      currCount: assistantTexts.length,
      replyStartAssistantCount,
    })
    if (!delta) {
      const changedLatest = getChangedLatestAssistantText(assistantBaselineList, assistantTexts)
      if (!changedLatest) {
        noDeltaPolls += 1
        return
      }
      delta = changedLatest
    }
    noDeltaPolls = 0
    const normalizedDelta = normalizeFallbackDelta(delta, assistantBaselineText, currentText)
    let sanitizedDelta = sanitizeReplyCandidate(normalizedDelta)
    if (!sanitizedDelta && committedOutputTokens === 0) {
      const latestAssistant = getLatestAssistantTextFromConversation()
      sanitizedDelta = sanitizeReplyCandidate(latestAssistant)
    }
    if (!sanitizedDelta) return

    void countOutputDelta('assistant_delta', sanitizedDelta, () => {
      outputCountedForCurrentReply = true
      awaitingAssistantReply = false
      assistantBaselineText = currentText
      assistantBaselineList = assistantTexts
      trustedAssistantBaselineText = assistantBaselineText
      trustedAssistantBaselineList = assistantBaselineList.slice()
      trustedReplyBaselineRaw = getReplyBaselineAssistantRaw()
      lastOutputCountedAt = Date.now()
      publishPlatformState({ reason: 'assistant_delta', deltaLen: delta.length })
    })
  }

  function maybeCountOutputByConversationFallback() {
    if (outputCountInFlight) return
    if (outputCountedForCurrentReply) return
    const now = Date.now()
    const waitingForReply = awaitingAssistantReply
    const recentCommitWindow = now - lastInputCommittedAt < 45000
    if (!waitingForReply && !recentCommitWindow) return
    if (waitingForReply && awaitingStartedAt > 0 && now - awaitingStartedAt < 2000) return
    if (!waitingForReply && now - lastOutputCountedAt < 1500) return
    const assistantBlocks = strategy.findAssistantBlocks()
    const messages = collectConversationMessages(strategy.findConversationBlocks(), assistantBlocks)
    let assistantRaw = buildAssistantText(messages)
    if (platform === 'yiyan' || platform === 'moonshot') {
      // Yiyan role tagging is unstable across layouts; prefer the latest visible
      // assistant-like conversation block so output delta is countable.
      const latestAssistant = getLatestAssistantTextFromConversation()
      if (latestAssistant) {
        assistantRaw = latestAssistant
      }
    }
    if (!assistantRaw) {
      if ((platform === 'yiyan' || platform === 'moonshot') && waitingForReply && awaitingStartedAt > 0 && now - awaitingStartedAt > 10000) {
        const awaitingMs = now - awaitingStartedAt
        const stableMs = now - assistantLastChangedAt
        if (shouldAllowAwaitingResetNoDelta({
          awaitingMs,
          stableMs,
          consecutiveNoDeltaPolls: noDeltaPolls,
        })) {
          awaitingAssistantReply = false
          outputCountedForCurrentReply = false
          publishPlatformState({ reason: 'assistant_fallback_empty_timeout' })
        }
      }
      return
    }
    if (assistantRaw !== assistantFallbackLastSeenRaw) {
      assistantFallbackLastSeenRaw = assistantRaw
      assistantLastChangedAt = now
    }
    if (waitingForReply && now - assistantLastChangedAt < 2200) return
    let delta = ''
    if (!replyBaselineAssistantRaw) {
      // First assistant reply in a fresh window/session: baseline may be empty.
      delta = assistantRaw.trim()
    } else {
      delta = getAppendOnlyDelta(replyBaselineAssistantRaw, assistantRaw)
      if (!delta && platform === 'doubao') {
        delta = getTailWindowDelta(replyBaselineAssistantRaw, assistantRaw)
      }
      if (!delta) {
        const latestAssistant = getLatestAssistantTextFromConversation() || ''
        const baselineLatest = assistantBaselineList[assistantBaselineList.length - 1]?.trim() || ''
        const waitedLongEnough = waitingForReply && awaitingStartedAt > 0 && now - awaitingStartedAt > 2500
        if (latestAssistant && latestAssistant !== baselineLatest && waitedLongEnough) {
          const sanitizedLatestReply = sanitizeReplyCandidate(latestAssistant)
          if (sanitizedLatestReply) {
            dbg('fallback-latest-assistant-full', {
              textLen: sanitizedLatestReply.length,
              sample: sanitizedLatestReply.slice(0, 60),
            })
            void countOutputDelta('conversation_fallback_latest_reply', sanitizedLatestReply, () => {
              outputCountedForCurrentReply = true
              awaitingAssistantReply = false
              replyBaselineAssistantRaw = assistantRaw
              assistantFallbackLastSeenRaw = assistantRaw
              assistantBaselineText = getAssistantText()
              assistantBaselineList = collectAssistantTexts(strategy.findAssistantBlocks())
              trustedAssistantBaselineText = assistantBaselineText
              trustedAssistantBaselineList = assistantBaselineList.slice()
              trustedReplyBaselineRaw = replyBaselineAssistantRaw
              lastOutputCountedAt = Date.now()
              publishPlatformState({ reason: 'conversation_fallback_latest_reply', deltaLen: sanitizedLatestReply.length })
            })
            return
          }
        }
        const changedThisReply = assistantRaw.trim() !== replyBaselineAssistantRaw.trim()
        const isFirstOutputForSession = committedOutputTokens === 0 && lastOutputCountedAt === 0
        const isWaitedLongEnough = waitingForReply && awaitingStartedAt > 0 && now - awaitingStartedAt > 2500
        if (changedThisReply && isFirstOutputForSession && isWaitedLongEnough) {
          const latestAssistant = getLatestAssistantTextFromConversation() || assistantRaw.trim()
          const sanitizedFirstReply = sanitizeReplyCandidate(latestAssistant)
          if (sanitizedFirstReply) {
            dbg('fallback-first-reply-full', {
              textLen: sanitizedFirstReply.length,
              sample: sanitizedFirstReply.slice(0, 60),
            })
            void countOutputDelta('conversation_fallback_first_reply', sanitizedFirstReply, () => {
              outputCountedForCurrentReply = true
              awaitingAssistantReply = false
              replyBaselineAssistantRaw = assistantRaw
              assistantFallbackLastSeenRaw = assistantRaw
              assistantBaselineText = getAssistantText()
              assistantBaselineList = collectAssistantTexts(strategy.findAssistantBlocks())
              trustedAssistantBaselineText = assistantBaselineText
              trustedAssistantBaselineList = assistantBaselineList.slice()
              trustedReplyBaselineRaw = replyBaselineAssistantRaw
              lastOutputCountedAt = Date.now()
              publishPlatformState({ reason: 'conversation_fallback_first_reply', deltaLen: sanitizedFirstReply.length })
            })
            return
          }
        }
        return
      }
    }
    if (!delta) return
    const normalizedDelta = normalizeFallbackDelta(delta, replyBaselineAssistantRaw, assistantRaw)
    let sanitizedDelta = sanitizeReplyCandidate(normalizedDelta)
    if (!sanitizedDelta && committedOutputTokens === 0) {
      const latestAssistant = getLatestAssistantTextFromConversation() || assistantRaw.trim()
      sanitizedDelta = sanitizeReplyCandidate(latestAssistant)
    }
    if (!sanitizedDelta) return
    if (isSuspiciousFallbackDelta(sanitizedDelta, replyBaselineAssistantRaw, assistantRaw)) {
      publishPlatformState({
        reason: 'fallback_delta_too_large_skipped',
        deltaLen: sanitizedDelta.length,
        baselineLen: replyBaselineAssistantRaw.length,
        assistantLen: assistantRaw.length,
      })
      return
    }
    dbg('fallback-conversation-delta', { deltaLen: delta.length, sample: delta.slice(0, 60) })
    void countOutputDelta('conversation_fallback', sanitizedDelta, () => {
      outputCountedForCurrentReply = true
      awaitingAssistantReply = false
      replyBaselineAssistantRaw = assistantRaw
      assistantFallbackLastSeenRaw = assistantRaw
      assistantBaselineText = getAssistantText()
      assistantBaselineList = collectAssistantTexts(strategy.findAssistantBlocks())
      trustedAssistantBaselineText = assistantBaselineText
      trustedAssistantBaselineList = assistantBaselineList.slice()
      trustedReplyBaselineRaw = replyBaselineAssistantRaw
      lastOutputCountedAt = Date.now()
      publishPlatformState({ reason: 'conversation_fallback', deltaLen: delta.length })
    })
  }

  function maybeSelfHealOutputStall() {
    if (!(platform === 'yiyan' || platform === 'moonshot')) return
    const now = Date.now()
    if (!shouldAttemptOutputSelfHeal({
      now,
      lastSelfHealAttemptAt,
      lastInputCommittedAt,
      lastOutputCountedAt,
      awaitingAssistantReply,
      awaitingStartedAt,
    })) return

    const latestAssistant = getLatestAssistantTextFromConversation()
    if (!latestAssistant) return

    // Try to recover by reopening output-capture window for this round.
    outputCountedForCurrentReply = false
    awaitingAssistantReply = true
    awaitingStartedAt = now - 3000
    if (!replyBaselineAssistantRaw) {
      replyBaselineAssistantRaw = ''
    }
    lastSelfHealAttemptAt = now
    publishPlatformState({ reason: 'self_heal_output_stall', assistantLen: latestAssistant.length })
  }

  async function maybeForceCommitAssistantOnTimeout(currentAssistantText: string) {
    if (outputCountInFlight) return
    if (!awaitingAssistantReply || outputCountedForCurrentReply) return
    let delta = ''
    if (assistantBaselineText) {
      delta = getAppendOnlyDelta(assistantBaselineText, currentAssistantText)
      if (!delta && platform === 'doubao') {
        delta = getTailWindowDelta(assistantBaselineText, currentAssistantText)
      }
    } else {
      delta = currentAssistantText.trim()
    }

    if (!delta) {
      const now = Date.now()
      const awaitingMs = awaitingStartedAt > 0 ? now - awaitingStartedAt : 0
      const stableMs = now - assistantLastChangedAt
      if (shouldAllowAwaitingResetNoDelta({
        awaitingMs,
        stableMs,
        consecutiveNoDeltaPolls: noDeltaPolls,
      })) {
        awaitingAssistantReply = false
        outputCountedForCurrentReply = false
        publishPlatformState({ reason: 'awaiting_timeout_reset_no_delta' })
      }
      return
    }

    const normalizedDelta = normalizeFallbackDelta(delta, assistantBaselineText, currentAssistantText)
    let sanitizedDelta = sanitizeReplyCandidate(normalizedDelta)
    if (!sanitizedDelta && committedOutputTokens === 0) {
      const latestAssistant = getLatestAssistantTextFromConversation() || currentAssistantText.trim()
      sanitizedDelta = sanitizeReplyCandidate(latestAssistant)
    }
    if (!sanitizedDelta) {
      const now = Date.now()
      const awaitingMs = awaitingStartedAt > 0 ? now - awaitingStartedAt : 0
      const stableMs = now - assistantLastChangedAt
      if (shouldAllowAwaitingResetNoDelta({
        awaitingMs,
        stableMs,
        consecutiveNoDeltaPolls: noDeltaPolls,
      })) {
        awaitingAssistantReply = false
        outputCountedForCurrentReply = false
        publishPlatformState({ reason: 'awaiting_timeout_reset_no_delta' })
      }
      return
    }

    const ok = await countOutputDelta('awaiting_timeout_force', sanitizedDelta, () => {
      outputCountedForCurrentReply = true
      awaitingAssistantReply = false
      assistantBaselineText = currentAssistantText
      assistantBaselineList = collectAssistantTexts(strategy.findAssistantBlocks())
      trustedAssistantBaselineText = assistantBaselineText
      trustedAssistantBaselineList = assistantBaselineList.slice()
      trustedReplyBaselineRaw = getReplyBaselineAssistantRaw()
      lastOutputCountedAt = Date.now()
      publishPlatformState({ reason: 'awaiting_timeout_force_counted', deltaLen: delta.length })
    })
    if (!ok) {
      awaitingAssistantReply = false
      outputCountedForCurrentReply = false
      publishPlatformState({ reason: 'awaiting_timeout_force_failed' })
    }
  }

  function getConversationFingerprint(): string {
    const assistantBlocks = strategy.findAssistantBlocks()
    const messages = collectConversationMessages(strategy.findConversationBlocks(), assistantBlocks)
    const meaningful = messages
      .map((msg) => normalizeMessageText(msg.content || ''))
      .filter((text) => {
        if (!text || text.length < 3) return false
        const lower = text.toLowerCase()
        if (
          lower.includes('深度分析需求并解答') ||
          lower.includes('你需要什么帮助') ||
          lower.includes('给kimi发送消息')
        ) return false
        return !strategy.getIgnoredSnippets().some((snippet) => lower.includes(snippet))
      })

    if (meaningful.length === 0) return 'empty'
    const tail = meaningful.slice(-4).join('\n')
    return `${meaningful.length}:${hashText(tail)}`
  }

  function getContextFingerprint(): string {
    const blocks = strategy.findConversationBlocks() as HTMLElement[]
    if (blocks.length === 0) return 'none'
    const ignored = strategy.getIgnoredSnippets()
    const parts = blocks
      .map((el) => normalizeMessageText(el.textContent || ''))
      .filter((text) => {
        if (!text || text.length < 2) return false
        const lower = text.toLowerCase()
        if (
          lower.includes('深度分析需求并解答') ||
          lower.includes('你需要什么帮助') ||
          lower.includes('给kimi发送消息')
        ) return false
        return !ignored.some((snippet) => lower.includes(snippet))
      })
    if (parts.length === 0) return 'none'
    const sample = parts.slice(-8).join('\n')
    return `${parts.length}:${hashText(sample)}`
  }

  function getReplyBaselineAssistantRaw(): string {
    const assistantBlocks = strategy.findAssistantBlocks()
    const messages = collectConversationMessages(strategy.findConversationBlocks(), assistantBlocks)
    const roleBased = buildAssistantText(messages)
    if (platform === 'yiyan' || platform === 'moonshot') {
      const latestAssistant = getLatestAssistantTextFromConversation()
      return latestAssistant || roleBased
    }
    return roleBased
  }

  function getAssistantText(): string {
    return collectAssistantTexts(strategy.findAssistantBlocks()).join('\n').trim()
  }

  function getAssistantDeltaByList(baselineList: string[], currentList: string[]): string {
    if (currentList.length === 0) return ''
    if (currentList.length > replyStartAssistantCount) {
      return currentList.slice(replyStartAssistantCount).join('\n').trim()
    }
    const latest = currentList[currentList.length - 1]?.trim() || ''
    if (!latest) return ''
    const baselineLatest = baselineList[baselineList.length - 1]?.trim() || ''
    if (!baselineLatest) return latest
    return getAppendOnlyDelta(baselineLatest, latest)
  }

  function getChangedLatestAssistantText(baselineList: string[], currentList: string[]): string {
    if (currentList.length === 0) return ''
    const latest = currentList[currentList.length - 1]?.trim() || ''
    if (!latest) return ''
    const baselineLatest = baselineList[baselineList.length - 1]?.trim() || ''
    if (!baselineLatest) return latest
    if (latest === baselineLatest) return ''
    return latest
  }

  function getLatestAssistantTextFromConversation(): string {
    const blocks = strategy.findConversationBlocks() as HTMLElement[]
    if (blocks.length === 0) return ''
    const ignored = strategy.getIgnoredSnippets()
    const candidates = blocks.filter((el) => {
      const text = (el.textContent || '').trim()
      if (!text || text.length < 2 || text.length > 4000) return false
      const lower = text.toLowerCase()
      if (ignored.some((s) => lower.includes(s))) return false
      const rect = el.getBoundingClientRect()
      if (rect.width < 80 || rect.height < 20) return false
      if (
        lower.includes('深度分析需求并解答') ||
        lower.includes('你需要什么帮助') ||
        lower.includes('给kimi发送消息')
      ) return false
      return true
    })
    if (candidates.length === 0) return ''

    const scored = candidates
      .map((el) => {
        const text = (el.textContent || '').trim()
        const sig = `${el.className || ''} ${el.getAttribute('data-role') || ''} ${el.getAttribute('data-testid') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase()
        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        let score = 0
        if (/\bassistant\b|\banswer\b|\bbot\b|\breply\b|\bai\b/.test(sig)) score += 3
        if (/\buser\b|\bquestion\b|\bask\b|\bprompt\b/.test(sig)) score -= 3
        // Most chat UIs render assistant on the left/middle and user on right.
        if (centerX <= window.innerWidth * 0.58) score += 1
        else if (centerX >= window.innerWidth * 0.68) score -= 1
        // Prefer blocks with richer content, but avoid giant wrappers.
        score += Math.min(Math.floor(text.length / 60), 3)
        return { el, score, top: rect.top }
      })
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return b.top - a.top
      })

    if (platform === 'yiyan') {
      const yiyanPreferred = scored.find((item) => {
        const rect = item.el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        return centerX <= window.innerWidth * 0.72
      })
      if (yiyanPreferred) return (yiyanPreferred.el.textContent || '').trim()
    }

    const best = scored[0]
    if (!best || best.score < 0) {
      if (platform === 'yiyan') {
        return getYiyanAssistantFallbackText()
      }
      return ''
    }
    return (best.el.textContent || '').trim()
  }

  function getYiyanAssistantFallbackText(): string {
    const ignored = strategy.getIgnoredSnippets()
    const nodes = Array.from(document.querySelectorAll(
      'main [class*="assistant"], main [class*="answer"], main [class*="response"], main [class*="markdown"], main [class*="content"], main article, main p'
    )) as HTMLElement[]

    const candidates = nodes
      .filter((el) => {
        if (!el.isConnected) return false
        if (el.closest('button, [role="button"], nav, header, footer, aside')) return false
        const text = (el.textContent || '').trim()
        if (!text || text.length < 4 || text.length > 5000) return false
        const lower = text.toLowerCase()
        if (
          lower.includes('点击发送') ||
          lower.includes('按enter发送') ||
          lower.includes('大家都在问') ||
          lower.includes('为你推荐') ||
          lower.includes('猜你想问')
        ) return false
        if (ignored.some((s) => lower.includes(s))) return false
        const rect = el.getBoundingClientRect()
        if (rect.width < 80 || rect.height < 20) return false
        const centerX = rect.left + rect.width / 2
        // User bubble is usually on the right side.
        if (centerX > window.innerWidth * 0.72) return false
        return true
      })
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)

    return (candidates[0]?.textContent || '').trim()
  }

  async function countOutputDelta(reason: string, text: string, onSuccess: () => void): Promise<boolean> {
    if (!text) return false
    if (outputCountInFlight) return false
    const signature = createOutputSignature(getConversationKey(), text)
    if (countedOutputSignatures.has(signature)) {
      onSuccess()
      updateDisplay()
      return true
    }
    if (pendingOutputSignatures.has(signature)) return false
    outputCountInFlight = true
    pendingOutputSignatures.add(signature)
    dbg('count-output:start', { textLen: text.length, sample: text.slice(0, 40) })
    try {
      const resp = await sendRequest({
        type: 'count_tokens',
        platform,
        text,
      })
      if (resp?.type === 'token_count') {
        const tokenCount = (resp.data as TokenCount).totalTokens
        dbg('count-output:done', { tokenCount })
        committedOutputTokens += tokenCount
        countedOutputSignatures.add(signature)
        bumpContextHistoryFromCommit(tokenCount, 1)
        trace('output_committed', {
          source: reason,
          tokenCount,
          textLen: text.length,
        })
        onSuccess()
        await updateContextTokens()
        await recordUsage({ outputTokens: tokenCount })
        updateDisplay()
        return true
      }
      publishPlatformState({
        reason: 'output_count_error',
        source: reason,
        error: resp?.type === 'error' ? resp.message : 'Unknown error',
      })
      updateDisplay()
      return false
    } finally {
      pendingOutputSignatures.delete(signature)
      outputCountInFlight = false
    }
  }

  async function recordUsage(delta: { inputTokens?: number; outputTokens?: number }) {
    if (!currentSessionId) await ensureSession()
    if (!currentSessionId) return

    await sendRequest({
      type: 'record_token_usage',
      platform,
      sessionId: currentSessionId,
      inputTokens: delta.inputTokens,
      outputTokens: delta.outputTokens,
      contextWindowTokens,
    })
  }

  async function updateContextTokens(currentInput = domObserver.getCurrentInputText()) {
    const version = ++contextVersion
    const assistantBlocks = strategy.findAssistantBlocks()
    const rawMessages = collectConversationMessages(strategy.findConversationBlocks(), assistantBlocks)
    const ignored = strategy.getIgnoredSnippets()
    const isIgnoredLine = (text: string): boolean => {
      const lower = text.toLowerCase()
      if (
        lower.includes('给kimi发送消息') ||
        lower.includes('你需要什么帮助') ||
        lower.includes('深度分析需求并解答') ||
        lower.includes('点击发送') ||
        lower.includes('按enter发送') ||
        lower.includes('大家都在问') ||
        lower.includes('为你推荐') ||
        lower.includes('猜你想问')
      ) return true
      return ignored.some((snippet) => lower.includes(snippet))
    }
    const messages = rawMessages.filter((msg) => {
      const text = (msg.content || '').trim()
      if (!text || text.length < 2 || text.length > 4000) return false
      return !isIgnoredLine(text)
    })
    let { rawText, turnCount } = buildContextText(messages, '')

    // Kimi/Yiyan occasionally render messages in wrappers that make role extraction sparse.
    // Use multi-source sampling and keep the richest valid text set.
    if (platform === 'moonshot' || platform === 'yiyan') {
      const blocks = strategy.findConversationBlocks() as HTMLElement[]
      const lines = blocks
        .map((el) => (el.textContent || '').trim())
        .filter((text) => {
          if (!text || text.length < 2 || text.length > 4000) return false
          return !isIgnoredLine(text)
        })
      const conversationText = lines.join('\n')

      const broadNodes = Array.from(document.querySelectorAll(
        'main [class*="markdown"], main [class*="message"], main [class*="chat-item"], main [class*="segment"], main [class*="content"], main article, main p, main pre, main li'
      )) as HTMLElement[]
      const broadLines = broadNodes
        .map((el) => (el.textContent || '').trim())
        .filter((text) => {
          if (!text || text.length < 2 || text.length > 4000) return false
          return !isIgnoredLine(text)
        })
      const broadText = broadLines.join('\n')

      const primaryLen = rawText.trim().length
      const conversationLen = conversationText.trim().length
      const broadLen = broadText.trim().length

      // Pick richer candidate when current text is too short/sparse.
      if (
        primaryLen < 120 ||
        turnCount <= 1 ||
        conversationLen > primaryLen * 1.35 ||
        broadLen > primaryLen * 1.35
      ) {
        if (broadLen >= conversationLen && broadLen > primaryLen) {
          rawText = broadText
          turnCount = Math.max(turnCount, broadLines.length)
        } else if (conversationLen > primaryLen) {
          rawText = conversationText
          turnCount = Math.max(turnCount, lines.length)
        }
      }
    }

    if (!rawText.trim()) {
      updateContextFromParts()
      updateDisplay()
      return
    }

    const resp = await sendRequest({ type: 'count_tokens', platform, text: rawText })
    if (version !== contextVersion) return
    if (resp?.type === 'token_count') {
      const rawTokens = (resp.data as TokenCount).totalTokens
      const beforeTokens = contextHistoryTokens
      const beforeTurns = contextHistoryTurns
      const fingerprint = getContextFingerprint()
      const merge = mergeContextHistorySample(
        {
          tokens: contextHistoryTokens,
          turns: contextHistoryTurns,
          fingerprint: lastContextFingerprint,
        },
        {
          tokens: rawTokens,
          turns: turnCount,
          fingerprint,
        }
      )
      if (merge.decision === 'accepted') {
        shrinkStableCount = 0
        lastShrinkSampleTokens = 0
        shrinkReportFingerprint = ''
        shrinkReportCount = 0
        applyTrustedContextHistory(merge.state)
        if (contextHistoryTokens !== beforeTokens || contextHistoryTurns !== beforeTurns) {
          trace('context_accepted', {
            sampledTokens: rawTokens,
            sampledTurns: turnCount,
            trustedTokens: contextHistoryTokens,
            trustedTurns: contextHistoryTurns,
          })
        }
      } else if (merge.decision === 'ignored_shrink') {
        const sampledRatio = contextHistoryTokens > 0 ? rawTokens / contextHistoryTokens : 0
        const risingSample = rawTokens >= Math.max(lastShrinkSampleTokens, Math.floor(contextHistoryTokens * 0.72))
        if (risingSample) {
          shrinkStableCount += 1
          lastShrinkSampleTokens = rawTokens
        } else {
          shrinkStableCount = 0
          lastShrinkSampleTokens = rawTokens
        }

        if (shrinkStableCount >= 3 && sampledRatio >= 0.82) {
          applyTrustedContextHistory({
            tokens: rawTokens,
            turns: Math.max(turnCount, Math.min(contextHistoryTurns, turnCount + 2)),
            fingerprint,
          })
          shrinkStableCount = 0
          lastShrinkSampleTokens = 0
          trace('context_recovered_from_shrink', {
            sampledTokens: rawTokens,
            sampledTurns: turnCount,
            trustedTokens: contextHistoryTokens,
            trustedTurns: contextHistoryTurns,
          })
        }

        const now = Date.now()
        if (fingerprint !== shrinkReportFingerprint) {
          shrinkReportFingerprint = fingerprint
          shrinkReportCount = 0
        }
        shrinkReportCount += 1
        const shouldReport = (
          shrinkReportCount === 1 ||
          shrinkReportCount % 5 === 0 ||
          now - shrinkReportLastAt > 15000
        )
        if (shouldReport) {
          shrinkReportLastAt = now
          publishPlatformState({
            reason: 'context_shrink_ignored',
            sampledTokens: rawTokens,
            trustedTokens: contextHistoryTokens,
            sampledTurns: turnCount,
            trustedTurns: contextHistoryTurns,
            sampledFingerprint: fingerprint,
            trustedFingerprint: lastContextFingerprint,
            shrinkCount: shrinkReportCount,
          })
          trace('context_ignored_shrink', {
            sampledTokens: rawTokens,
            sampledTurns: turnCount,
            trustedTokens: contextHistoryTokens,
            trustedTurns: contextHistoryTurns,
            shrinkCount: shrinkReportCount,
          })
        }
      }
      updateContextFromParts(currentInput.trim() ? currentInputTokenCount : 0)
    }
    updateDisplay()
  }

  function applyTrustedContextHistory(state: ContextHistoryState) {
    contextHistoryTokens = state.tokens
    contextHistoryTurns = state.turns
    lastContextFingerprint = state.fingerprint
  }

  function updateContextFromParts(inputTokens = currentInputTokenCount) {
    const inputTurnOverhead = inputTokens > 0 ? CHAT_TEMPLATE_OVERHEAD : 0
    contextWindowTokens = (
      SYSTEM_PROMPT_BASE[platform] +
      contextHistoryTokens +
      contextHistoryTurns * CHAT_TEMPLATE_OVERHEAD +
      inputTokens +
      inputTurnOverhead
    )
    updateDisplay()
  }

  function updateDisplay() {
    floatingBar.update(lastInputCharCount, {
      currentInputTokens: currentInputTokenCount,
      inputTokens: committedInputTokens,
      outputTokens: committedOutputTokens,
      totalTokens: committedInputTokens + committedOutputTokens,
      contextWindowTokens,
    }, {
      question: lastObservedInputText || lastCommittedInputText || '',
      isThinking: awaitingAssistantReply && !outputCountedForCurrentReply,
    })
    publishPlatformState()
  }

  function applySessionState(session: SessionState) {
    currentDayKey = session.dayKey || getLocalDayKey()
    currentSessionId = session.sessionId
    committedInputTokens = session.inputTokens
    committedOutputTokens = session.outputTokens
    if (session.contextWindowTokens > contextWindowTokens) {
      const restored = restoreContextHistoryFromWindow(
        {
          tokens: contextHistoryTokens,
          turns: contextHistoryTurns,
          fingerprint: lastContextFingerprint,
        },
        session.contextWindowTokens,
        SYSTEM_PROMPT_BASE[platform]
      )
      applyTrustedContextHistory(restored)
      updateContextFromParts()
    }
    updateDisplay()
  }

  async function ensureSession() {
    const convKey = getConversationKey()
    const resp = await sendRequest({ type: 'get_session_id', platform, conversationKey: convKey })
    if (resp?.type === 'session_id' && getConversationKey() === convKey) {
      lastConversationKey = convKey
      applySessionState(resp.data.session)
    }
  }

  async function promoteCurrentSession(conversationKey: string) {
    if (!currentSessionId) return
    const resp = await sendRequest({
      type: 'promote_session',
      platform,
      sessionId: currentSessionId,
      conversationKey,
    })
    if (resp?.type === 'session_id') {
      conversationKeyLocked = conversationKey
      lastConversationKey = conversationKey
      applySessionState(resp.data.session)
      publishPlatformState({ reason: 'session_promoted_to_resolved_key', conversationKey })
    }
  }

  function maybeRollOverDailySession() {
    const nextDayKey = getLocalDayKey()
    if (nextDayKey === currentDayKey) return
    currentDayKey = nextDayKey
    publishPlatformState({ reason: 'daily_rollover' })
    resetConversation(true)
  }

  /** Reset counters for a new conversation */
  function resetConversation(force = false, startSession = true, refreshContext = true) {
    const convKey = getConversationKey()
    if (!force && convKey === lastConversationKey) return
    lastConversationKey = convKey
    currentSessionId = ''
    committedInputTokens = 0
    committedOutputTokens = 0
    lastInputCharCount = 0
    currentInputTokenCount = 0
    awaitingAssistantReply = false
    outputCountedForCurrentReply = false
    awaitingStartedAt = 0
    noDeltaPolls = 0
    outputCountInFlight = false
    countedOutputSignatures.clear()
    pendingOutputSignatures.clear()
    recentInputCommitKeys.clear()
    platformEventLog.length = 0
    assistantBaselineText = getAssistantText()
    assistantBaselineList = collectAssistantTexts(strategy.findAssistantBlocks())
    replyStartAssistantCount = assistantBaselineList.length
    {
      replyBaselineAssistantRaw = getReplyBaselineAssistantRaw()
      assistantFallbackLastSeenRaw = replyBaselineAssistantRaw
    }
    trustedAssistantBaselineText = assistantBaselineText
    trustedAssistantBaselineList = assistantBaselineList.slice()
    trustedReplyBaselineRaw = replyBaselineAssistantRaw
    stableIdleAssistantTicks = 0
    lastIdleAssistantText = assistantBaselineText
    lastCommittedInputText = ''
    recentCommittedInputs.length = 0
    lastOutputCountedAt = 0
    assistantLastSeenText = assistantBaselineText
    assistantLastChangedAt = Date.now()
    contextWindowTokens = SYSTEM_PROMPT_BASE[platform]
    contextHistoryTokens = 0
    contextHistoryTurns = 0
    shrinkStableCount = 0
    lastShrinkSampleTokens = 0
    shrinkReportFingerprint = ''
    shrinkReportCount = 0
    shrinkReportLastAt = 0
    emptyConversationResetCount = 0
    lastContextFingerprint = ''
    contextVersion++
    lastConversationFingerprint = getConversationFingerprint()
    publishPlatformState({ reason: 'conversation_reset' })
    updateDisplay()
    if (refreshContext) updateContextTokens()
    if (!startSession) return
    sendRequest({ type: 'start_session', platform, conversationKey: convKey }).then((resp) => {
      if (resp?.type === 'session_id' && getConversationKey() === convKey) {
        applySessionState(resp.data.session)
      }
    })
  }

  function maybeResetDraftSessionOnEmptyConversation() {
    // Some platforms can start a brand-new topic without changing route.
    // If UI clearly returns to "no real user turn yet", force a fresh draft key.
    if (!shouldCheckEmptyConversationReset(platform)) return
    if (awaitingAssistantReply) return
    if (!committedInputTokens && !committedOutputTokens) return
    if (Date.now() - lastForcedDraftResetAt < 5000) return
    if (domObserver.getCurrentInputText().trim()) return
    if (hasConversationMessages()) {
      emptyConversationResetCount = 0
      return
    }
    emptyConversationResetCount += 1
    if (emptyConversationResetCount < 3) return
    if (hasResolvedSessionId(currentBaseConversationKey())) {
      publishPlatformState({ reason: 'empty_reset_skipped_resolved_session' })
      emptyConversationResetCount = 0
      return
    }
    draftConversationNonce += 1
    lastForcedDraftResetAt = Date.now()
    conversationKeyLocked = ''
    emptyConversationResetCount = 0
    publishPlatformState({ reason: 'forced_draft_reset_on_empty' })
    resetConversation()
  }

  function maybeResetConversationOnFingerprintChange() {
    if (!(platform === 'yiyan' || platform === 'moonshot')) return
    if (!conversationKeyLocked || conversationKeyLocked.includes(':draft:')) return
    if (awaitingAssistantReply) return
    if (Date.now() - lastForcedDraftResetAt < 5000) return

    const currentFingerprint = getConversationFingerprint()
    if (!lastConversationFingerprint) {
      lastConversationFingerprint = currentFingerprint
      return
    }
    if (currentFingerprint === lastConversationFingerprint) return

    if (currentFingerprint === 'empty' && (committedInputTokens > 0 || committedOutputTokens > 0)) {
      draftConversationNonce += 1
      lastForcedDraftResetAt = Date.now()
      conversationKeyLocked = ''
      publishPlatformState({ reason: 'fingerprint_reset_to_empty' })
      resetConversation()
      lastConversationFingerprint = 'empty'
      return
    }

    lastConversationFingerprint = currentFingerprint
  }

  /** Accumulate input tokens only when user sends a message. */
  async function commitInput(text: string) {
    const normalizedText = normalizeMessageText(text)
    if (!normalizedText) return
    if (isLikelyPlaceholderInput(normalizedText)) {
      dbg('commit-input:skip-placeholder', { text: normalizedText.slice(0, 40) })
      return
    }
    if (commitInFlight) {
      dbg('commit-input:skip-inflight')
      return
    }
    const now = Date.now()
    if (now - lastCommitRequestedAt < 350) return
    lastCommitRequestedAt = now
    if (normalizedText === lastSubmittedText && now - lastSubmittedAt < 1800) return
    const convKey = getConversationKey()
    if (!markInputCommittedOnce(convKey, normalizedText)) {
      dbg('commit-input:skip-dup-key', { convKey, textLen: normalizedText.length })
      return
    }
    dbg('commit-input:start', { textLen: normalizedText.length, text: normalizedText.slice(0, 40) })
    commitInFlight = true
    lastSubmittedText = normalizedText
    lastSubmittedAt = now

    try {
      const resp = await sendRequest({ type: 'count_tokens', platform, text: normalizedText })
      if (resp?.type === 'token_count') {
        const tokenCount = (resp.data as TokenCount).totalTokens
        dbg('commit-input:done', { tokenCount })
        committedInputTokens += tokenCount
        lastInputCommittedAt = Date.now()
        currentInputTokenCount = 0
        lastInputCharCount = 0
        inputVersion++
        awaitingAssistantReply = true
        outputCountedForCurrentReply = false
        awaitingStartedAt = Date.now()
        noDeltaPolls = 0
        outputCountInFlight = false
        assistantBaselineText = trustedAssistantBaselineText || getAssistantText()
        assistantBaselineList = trustedAssistantBaselineList.length > 0
          ? trustedAssistantBaselineList.slice()
          : collectAssistantTexts(strategy.findAssistantBlocks())
        replyStartAssistantCount = assistantBaselineList.length
        {
          replyBaselineAssistantRaw = trustedReplyBaselineRaw || getReplyBaselineAssistantRaw()
          assistantFallbackLastSeenRaw = replyBaselineAssistantRaw
        }
        if (!replyBaselineAssistantRaw) {
          // Some platforms (e.g. Tongyi) render conversation nodes with delay.
          // Keep baseline empty-safe; fallback path can count the first assistant reply.
          replyBaselineAssistantRaw = ''
        }
        lastCommittedInputText = normalizedText
        recentCommittedInputs.unshift(normalizedText)
        if (recentCommittedInputs.length > 6) recentCommittedInputs.length = 6
        assistantLastSeenText = assistantBaselineText
        assistantLastChangedAt = Date.now()
        bumpContextHistoryFromCommit(tokenCount, 1)
        publishPlatformState({ reason: 'input_committed', inputTokenCount: tokenCount })
        trace('input_committed', {
          tokenCount,
          textLen: normalizedText.length,
        })
        await updateContextTokens('')
        await recordUsage({ inputTokens: tokenCount })
      } else {
        dbg('commit-input:error', resp)
        const errorMsg = (resp && 'message' in resp) ? String(resp.message || '') : ''
        publishPlatformState({ reason: 'input_commit_error', error: errorMsg })
      }
    } finally {
      commitInFlight = false
    }
    updateDisplay()
  }

  domObserver.observeInput((text) => {
    handleObservedInput(text)
  }, commitInput)

  function handleObservedInput(text: string) {
    lastObservedInputText = text
    if (text.trim()) lastNonEmptyInputText = text
    inputVersion++
    countInputTokens(text, inputVersion)
  }

  registerInterval(() => {
    if (!extensionContextAlive) return
    const text = domObserver.getCurrentInputText()
    if (text === lastObservedInputText) return

    handleObservedInput(text)
  }, 300)

  registerInterval(() => {
    if (!extensionContextAlive) return
    maybeRollOverDailySession()
  }, 30000)

  // Poll for assistant replies every 1s
  registerInterval(() => {
    if (!extensionContextAlive) return
    if (outputCountInFlight) return
    pollAssistantReply()
    maybeCountOutputByConversationFallback()
    maybeSelfHealOutputStall()
  }, 1000)

  // Watch for conversation changes
  let prevRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
  registerInterval(() => {
    if (!extensionContextAlive) return
    const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (currentRoute === prevRoute) return
    const previousKey = conversationKeyLocked
    const wasDraft = isDraftConversationKey(previousKey)
    const recentPromotionWindow = Date.now() - lastSubmittedAt < 90000
    const hasStartedSession = committedInputTokens > 0
    const resolvedKey = currentBaseConversationKey()
    prevRoute = currentRoute
    if (wasDraft && hasStartedSession && recentPromotionWindow) {
      if (hasResolvedSessionId(resolvedKey)) {
        void promoteCurrentSession(resolvedKey)
      }
      return
    }
    draftConversationNonce += 1
    conversationKeyLocked = ''
    resetConversation()
  }, 2000)

  // No-route-change guard: detect UI-level "new topic" resets on platforms
  // that can keep URL stable while replacing the conversation.
  registerInterval(() => {
    if (!extensionContextAlive) return
    maybeResetDraftSessionOnEmptyConversation()
    maybeResetConversationOnFingerprintChange()
  }, 1800)

  // Recalculate context when history content is loaded/re-rendered without typing.
  registerInterval(() => {
    if (!extensionContextAlive) return
    const fp = getContextFingerprint()
    if (fp === 'none' || fp === lastContextFingerprint) return
    updateContextTokens()
  }, 2000)

  // Get session ID
  ensureSession()

  // Mount floating bar
  const tryMount = () => {
    if (barMounted && document.getElementById('ai-token-guard-bar')) return
    const readyState = strategy.isReady()
    if (!readyState.ready) {
      dbg('strategy-not-ready', { host: window.location.hostname, missing: readyState.missing })
      setTimeout(tryMount, 800)
      return
    }

    const inputEl = domObserver.findInputElement()
    if (!inputEl) {
      setTimeout(tryMount, 800)
      return
    }

    dbg('mount-floating-bar', { tagName: inputEl.tagName, strategy: strategy.platform })
    floatingBar.mount(inputEl as HTMLElement)
    barMounted = true
    assistantBaselineText = getAssistantText()
    assistantBaselineList = collectAssistantTexts(strategy.findAssistantBlocks())
    replyStartAssistantCount = assistantBaselineList.length
    {
      replyBaselineAssistantRaw = getReplyBaselineAssistantRaw()
      assistantFallbackLastSeenRaw = replyBaselineAssistantRaw
    }
    lastCommittedInputText = ''
    recentCommittedInputs.length = 0
    assistantLastSeenText = assistantBaselineText
    assistantLastChangedAt = Date.now()
    if (!hasMountedOnce) {
      hasMountedOnce = true
      draftConversationNonce += 1
      conversationKeyLocked = ''
      resetConversation()
      updateContextTokens()
      return
    }
    trustedAssistantBaselineText = assistantBaselineText
    trustedAssistantBaselineList = assistantBaselineList.slice()
    trustedReplyBaselineRaw = replyBaselineAssistantRaw
    updateDisplay()
    updateContextTokens()
  }
  setTimeout(tryMount, 500)

  // Watchdog: remount floating bar if host page re-renders and removes it.
  registerInterval(() => {
    if (!extensionContextAlive) return
    const exists = Boolean(document.getElementById('ai-token-guard-bar'))
    if (!exists && barMounted) {
      barMounted = false
    }
    if (!exists) {
      tryMount()
    }
  }, 2000)
}
