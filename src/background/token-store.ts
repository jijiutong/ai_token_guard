import type { HourlyTokenUsage, SessionState, PlatformName, DailyStatsV2, Last24hStatsV2 } from '../shared/types'
import { PLATFORMS } from '../shared/types'
import { generateSessionId } from '../shared/utils'
import { getLocalDayKey } from '../shared/day-key'

const STORAGE_KEY = 'ai-token-guard:data'
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

interface PersistedData {
  sessions: Record<string, SessionState>
  usageEvents?: Array<UsageEvent | { timestamp: number; tokens: number }>
}

interface UsageEvent {
  timestamp: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  platform: PlatformName
}

interface UsageDelta {
  inputTokens?: number
  outputTokens?: number
  contextWindowTokens?: number
}

export class TokenStore {
  private sessions: Record<string, SessionState> = {}
  private usageEvents: UsageEvent[] = []

  async load() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      const data = result[STORAGE_KEY] as PersistedData | undefined
      if (data) {
        this.sessions = data.sessions || {}
        this.usageEvents = this.pruneEvents(this.normalizeUsageEvents(data.usageEvents || []))
      }
    } catch {
      // ignore load errors
    }
  }

  async save() {
    const data: PersistedData = {
      sessions: this.sessions,
      usageEvents: this.pruneEvents(this.usageEvents),
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: data })
  }

  getOrCreateSession(platform: PlatformName, conversationKey?: string): SessionState {
    const now = Date.now()
    const dayKey = getLocalDayKey(now)
    for (const [id, state] of Object.entries(this.sessions)) {
      const sameConversation = conversationKey
        ? state.conversationKey === conversationKey
        : !state.conversationKey && now - state.lastActive < 5 * 60 * 1000
      const sameDay = (state.dayKey || getLocalDayKey(state.lastActive)) === dayKey

      if (state.platform === platform && sameConversation && sameDay) {
        state.lastActive = now
        state.dayKey = dayKey
        this.save()
        return this.sessions[id]
      }
    }
    return this.createSession(platform, conversationKey)
  }

  createSession(platform: PlatformName, conversationKey?: string): SessionState {
    const now = Date.now()
    const dayKey = getLocalDayKey(now)
    for (const session of Object.values(this.sessions)) {
      const sameDay = (session.dayKey || getLocalDayKey(session.lastActive)) === dayKey
      if (session.platform === platform && session.conversationKey === conversationKey && sameDay) {
        session.lastActive = now
        session.dayKey = dayKey
        this.save()
        return session
      }
    }

    const sessionId = generateSessionId()
    this.sessions[sessionId] = {
      sessionId,
      platform,
      conversationKey,
      dayKey,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextWindowTokens: 0,
      messageCount: 0,
      startTime: now,
      lastActive: now,
    }
    this.save()
    return this.sessions[sessionId]
  }

  recordUsage(sessionId: string, usage: UsageDelta): SessionState | null {
    const session = this.sessions[sessionId]
    if (!session) return null

    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const totalDelta = inputTokens + outputTokens

    session.inputTokens += inputTokens
    session.outputTokens += outputTokens
    session.totalTokens += totalDelta
    if (outputTokens > 0) session.messageCount++
    if (totalDelta > 0) {
      this.usageEvents.push({
        timestamp: Date.now(),
        inputTokens,
        outputTokens,
        totalTokens: totalDelta,
        platform: session.platform,
      })
      this.usageEvents = this.pruneEvents(this.usageEvents)
    }
    if (usage.contextWindowTokens !== undefined) {
      session.contextWindowTokens = usage.contextWindowTokens
    }
    session.lastActive = Date.now()
    this.save()
    return session
  }

  promoteSessionConversationKey(sessionId: string, conversationKey: string): SessionState | null {
    const session = this.sessions[sessionId]
    if (!session) return null
    if (session.conversationKey === conversationKey) return session

    const now = Date.now()
    const dayKey = getLocalDayKey(now)
    const existing = Object.values(this.sessions).find((candidate) => {
      const sameDay = (candidate.dayKey || getLocalDayKey(candidate.lastActive)) === dayKey
      return (
        candidate.sessionId !== sessionId &&
        candidate.platform === session.platform &&
        candidate.conversationKey === conversationKey &&
        sameDay
      )
    })

    if (existing) {
      existing.inputTokens += session.inputTokens
      existing.outputTokens += session.outputTokens
      existing.totalTokens += session.totalTokens
      existing.contextWindowTokens = Math.max(existing.contextWindowTokens, session.contextWindowTokens)
      existing.messageCount += session.messageCount
      existing.lastActive = now
      existing.dayKey = dayKey
      delete this.sessions[sessionId]
      this.save()
      return existing
    }

    session.conversationKey = conversationKey
    session.lastActive = now
    session.dayKey = dayKey
    this.save()
    return session
  }

  setContextWindow(sessionId: string, tokens: number) {
    const session = this.sessions[sessionId]
    if (!session) return
    session.contextWindowTokens = tokens
    session.lastActive = Date.now()
    this.save()
  }

  getTodayStats(): { tokens: number } {
    const today = getLocalDayKey()
    const tokens = this.pruneEvents(this.usageEvents)
      .filter((event) => getLocalDayKey(event.timestamp) === today)
      .reduce((sum, event) => sum + event.totalTokens, 0)
    return { tokens }
  }

  getTodayStatsV2(): DailyStatsV2 {
    const today = getLocalDayKey()
    const events = this.pruneEvents(this.usageEvents)
      .filter((event) => getLocalDayKey(event.timestamp) === today)
    const byPlatform = this.initDailyStatsByPlatform()
    const overview = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    for (const event of events) {
      overview.inputTokens += event.inputTokens
      overview.outputTokens += event.outputTokens
      overview.totalTokens += event.totalTokens
      const bucket = byPlatform[event.platform]
      bucket.inputTokens += event.inputTokens
      bucket.outputTokens += event.outputTokens
      bucket.totalTokens += event.totalTokens
    }

    return { overview, byPlatform }
  }

  getLast24hStats(): HourlyTokenUsage[] {
    const now = Date.now()
    const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS
    const buckets: HourlyTokenUsage[] = Array.from({ length: 24 }, (_, index) => ({
      hourStart: currentHourStart - (23 - index) * HOUR_MS,
      tokens: 0,
    }))

    const firstHourStart = buckets[0].hourStart
    for (const event of this.pruneEvents(this.usageEvents)) {
      if (event.timestamp < firstHourStart) continue
      const bucketIndex = Math.floor((event.timestamp - firstHourStart) / HOUR_MS)
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].tokens += event.totalTokens
      }
    }

    return buckets
  }

  getLast24hStatsV2(): Last24hStatsV2 {
    const now = Date.now()
    const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS
    const overview = this.createHourlyBuckets(currentHourStart)
    const byPlatform = this.initHourlyStatsByPlatform(currentHourStart)

    const firstHourStart = overview[0].hourStart
    for (const event of this.pruneEvents(this.usageEvents)) {
      if (event.timestamp < firstHourStart) continue
      const bucketIndex = Math.floor((event.timestamp - firstHourStart) / HOUR_MS)
      if (bucketIndex < 0 || bucketIndex >= overview.length) continue
      overview[bucketIndex].tokens += event.totalTokens
      byPlatform[event.platform][bucketIndex].tokens += event.totalTokens
    }

    return {
      last24hOverview: overview,
      last24hByPlatform: byPlatform,
    }
  }

  getActiveSession(platform: PlatformName): SessionState | null {
    for (const session of Object.values(this.sessions)) {
      if (session.platform === platform) return session
    }
    return null
  }

  async clearPlatformStats(platform: PlatformName) {
    this.usageEvents = this.usageEvents.filter((event) => event.platform !== platform)
    for (const [id, session] of Object.entries(this.sessions)) {
      if (session.platform === platform) {
        delete this.sessions[id]
      }
    }
    await this.save()
  }

  async clearAllStats() {
    this.sessions = {}
    this.usageEvents = []
    await this.save()
  }

  private pruneEvents(events: UsageEvent[]): UsageEvent[] {
    const cutoff = Date.now() - DAY_MS
    return events.filter((event) => event.timestamp >= cutoff && event.totalTokens > 0)
  }

  private normalizeUsageEvents(events: Array<UsageEvent | { timestamp: number; tokens: number }>): UsageEvent[] {
    const fallbackPlatform: PlatformName = 'deepseek'
    return events.map((event) => {
      if ('totalTokens' in event) return event
      return {
        timestamp: event.timestamp,
        inputTokens: event.tokens,
        outputTokens: 0,
        totalTokens: event.tokens,
        platform: fallbackPlatform,
      }
    })
  }

  private createHourlyBuckets(currentHourStart: number): HourlyTokenUsage[] {
    return Array.from({ length: 24 }, (_, index) => ({
      hourStart: currentHourStart - (23 - index) * HOUR_MS,
      tokens: 0,
    }))
  }

  private initDailyStatsByPlatform(): Record<PlatformName, { inputTokens: number; outputTokens: number; totalTokens: number }> {
    const byPlatform = {} as Record<PlatformName, { inputTokens: number; outputTokens: number; totalTokens: number }>
    for (const platform of Object.keys(PLATFORMS) as PlatformName[]) {
      byPlatform[platform] = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    }
    return byPlatform
  }

  private initHourlyStatsByPlatform(currentHourStart: number): Record<PlatformName, HourlyTokenUsage[]> {
    const byPlatform = {} as Record<PlatformName, HourlyTokenUsage[]>
    for (const platform of Object.keys(PLATFORMS) as PlatformName[]) {
      byPlatform[platform] = this.createHourlyBuckets(currentHourStart)
    }
    return byPlatform
  }
}
