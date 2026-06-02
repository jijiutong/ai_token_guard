import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  DailyStatsOverview,
  HourlyTokenUsage,
  Last24hStatsV2,
  MessageRequest,
  MessageResponse,
  PlatformName,
  QuotaConfig,
} from '../../shared/types'
import { PLATFORMS } from '../../shared/types'
import { getLocalDayKey } from '../../shared/day-key'

function emptyOverview(): DailyStatsOverview {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

function emptyOverviewByPlatform(): Record<PlatformName, DailyStatsOverview> {
  const result = {} as Record<PlatformName, DailyStatsOverview>
  for (const platform of Object.keys(PLATFORMS) as PlatformName[]) {
    result[platform] = emptyOverview()
  }
  return result
}

function emptyHourlyByPlatform(): Record<PlatformName, HourlyTokenUsage[]> {
  const result = {} as Record<PlatformName, HourlyTokenUsage[]>
  for (const platform of Object.keys(PLATFORMS) as PlatformName[]) {
    result[platform] = []
  }
  return result
}

export const useStatsStore = defineStore('stats', () => {
  const todayTokens = ref(0)
  const todayDayKey = ref(getLocalDayKey())
  const last24hStats = ref<HourlyTokenUsage[]>([])
  const todayOverview = ref<DailyStatsOverview>(emptyOverview())
  const todayByPlatform = ref<Record<PlatformName, DailyStatsOverview>>(emptyOverviewByPlatform())
  const last24hOverview = ref<HourlyTokenUsage[]>([])
  const last24hByPlatform = ref<Record<PlatformName, HourlyTokenUsage[]>>(emptyHourlyByPlatform())
  const selectedPlatform = ref<'overview' | PlatformName>('overview')
  const quotaConfig = ref<QuotaConfig>({})
  const loading = ref(false)

  async function loadDailyStats() {
    loading.value = true
    try {
      todayDayKey.value = getLocalDayKey()
      const response = await sendMessage({ type: 'get_daily_stats' })
      if (response?.type === 'daily_stats') {
        todayTokens.value = response.data.tokens
      }
    } finally {
      loading.value = false
    }
  }

  async function loadQuotaConfig() {
    const response = await sendMessage({ type: 'get_quota_config' })
    if (response?.type === 'quota_config') {
      quotaConfig.value = response.data
    }
  }

  async function loadLast24hStats() {
    const response = await sendMessage({ type: 'get_last24h_stats' })
    if (response?.type === 'last24h_stats') {
      last24hStats.value = response.data
    }
  }

  async function loadDailyStatsV2() {
    todayDayKey.value = getLocalDayKey()
    const response = await sendMessage({ type: 'get_daily_stats_v2' })
    if (response?.type === 'daily_stats_v2') {
      todayOverview.value = response.data.overview
      todayByPlatform.value = response.data.byPlatform
      todayTokens.value = response.data.overview.totalTokens
    }
  }

  async function loadLast24hStatsV2() {
    const response = await sendMessage({ type: 'get_last24h_stats_v2' })
    if (response?.type === 'last24h_stats_v2') {
      const data = response.data as Last24hStatsV2
      last24hOverview.value = data.last24hOverview
      last24hByPlatform.value = data.last24hByPlatform
      last24hStats.value = data.last24hOverview
    }
  }

  async function clearPlatformStats(platform: PlatformName) {
    await sendMessage({ type: 'clear_platform_stats', platform })
    await loadDailyStatsV2()
  }

  async function clearAllStats() {
    await sendMessage({ type: 'clear_all_stats' })
    await loadDailyStatsV2()
  }

  return {
    todayTokens, todayDayKey, last24hStats, quotaConfig, loading,
    todayOverview, todayByPlatform, last24hOverview, last24hByPlatform, selectedPlatform,
    loadDailyStats, loadLast24hStats, loadQuotaConfig, loadDailyStatsV2, loadLast24hStatsV2,
    clearPlatformStats, clearAllStats,
  }
})

function sendMessage(request: MessageRequest): Promise<MessageResponse | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, resolve)
  })
}
