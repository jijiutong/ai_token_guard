import type { QuotaConfig } from '../shared/types'
import type { PlatformName } from '../shared/types'
import { getLocalDayKey } from '../shared/day-key'

const CONFIG_KEY = 'ai-token-guard:quota'

const DEFAULT_CONFIG: QuotaConfig = {
  dailyTokenLimit: undefined,
  platformDailyTokenLimit: {},
}

export class QuotaManager {
  private config: QuotaConfig = { ...DEFAULT_CONFIG }
  private warned = { daily80: false, daily100: false }
  private warnedDayKey = getLocalDayKey()

  async load() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY)
      if (result[CONFIG_KEY]) {
        this.config = { ...DEFAULT_CONFIG, ...result[CONFIG_KEY] }
      }
    } catch {
      // use defaults
    }
  }

  getConfig(): QuotaConfig {
    return { ...this.config }
  }

  async updateConfig(config: Partial<QuotaConfig>) {
    this.config = { ...this.config, ...config }
    await chrome.storage.local.set({ [CONFIG_KEY]: this.config })
  }

  checkQuota(
    todayTokens: number,
    byPlatform?: Record<PlatformName, { inputTokens: number; outputTokens: number; totalTokens: number }>
  ): 'ok' | 'warning' | 'critical' {
    const currentDayKey = getLocalDayKey()
    if (currentDayKey !== this.warnedDayKey) {
      this.resetDailyWarnings()
      this.warnedDayKey = currentDayKey
    }
    let level: 'ok' | 'warning' | 'critical' = 'ok'
    let platformHit: PlatformName | null = null

    if (this.config.dailyTokenLimit) {
      const ratio = todayTokens / this.config.dailyTokenLimit
      if (ratio >= 1) level = 'critical'
      else if (ratio >= 0.8) level = 'warning'
    }

    if (byPlatform && this.config.platformDailyTokenLimit) {
      for (const [platform, limit] of Object.entries(this.config.platformDailyTokenLimit) as Array<[PlatformName, number]>) {
        if (!limit) continue
        const used = byPlatform[platform]?.totalTokens || 0
        const ratio = used / limit
        if (ratio >= 1) {
          level = 'critical'
          platformHit = platform
          break
        }
        if (ratio >= 0.8 && level === 'ok') {
          level = 'warning'
          platformHit = platform
        }
      }
    }

    this.updateBadge(level)

    if (level === 'critical' && !this.warned.daily100) {
      this.sendNotification('critical', todayTokens, platformHit)
      this.warned.daily100 = true
    } else if (level === 'warning' && !this.warned.daily80) {
      this.sendNotification('warning', todayTokens, platformHit)
      this.warned.daily80 = true
    }

    return level
  }

  private updateBadge(level: 'ok' | 'warning' | 'critical') {
    const colors = { ok: '#4CAF50', warning: '#FFC107', critical: '#F44336' }
    chrome.action.setBadgeBackgroundColor({ color: colors[level] })
    if (level === 'ok') {
      chrome.action.setBadgeText({ text: '' })
    } else {
      chrome.action.setBadgeText({ text: '!' })
    }
  }

  private sendNotification(level: 'warning' | 'critical', tokens: number, platform: PlatformName | null) {
    const title = level === 'critical' ? 'Token 额度已达上限' : 'Token 额度预警'
    const prefix = platform ? `${platform.toUpperCase()} · ` : ''
    const message = `${prefix}今日已消耗 ${tokens.toLocaleString()} tokens`
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title,
      message,
    })
  }

  resetDailyWarnings() {
    this.warned.daily80 = false
    this.warned.daily100 = false
  }
}
