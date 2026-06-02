/** 支持的大模型平台 */
export type PlatformName =
  | 'deepseek'
  | 'yiyan'
  | 'tongyi'
  | 'doubao'
  | 'moonshot'

export interface PlatformConfig {
  name: PlatformName
  displayName: string
  urlPatterns: string[]
  maxContextWindow: number
}

export const PLATFORMS: Record<PlatformName, PlatformConfig> = {
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    urlPatterns: ['chat.deepseek.com', 'www.deepseek.com'],
    maxContextWindow: 131072,
  },
  yiyan: {
    name: 'yiyan',
    displayName: '文心一言',
    urlPatterns: ['yiyan.baidu.com', 'chat.baidu.com'],
    maxContextWindow: 65536,
  },
  tongyi: {
    name: 'tongyi',
    displayName: '通义千问',
    urlPatterns: [
      'tongyi.aliyun.com',
      'qianwen.aliyun.com',
      'tongyi.com',
      'www.tongyi.com',
      'qianwen.com',
      'www.qianwen.com',
    ],
    maxContextWindow: 131072,
  },
  doubao: {
    name: 'doubao',
    displayName: '豆包',
    urlPatterns: ['doubao.com'],
    maxContextWindow: 65536,
  },
  moonshot: {
    name: 'moonshot',
    displayName: 'Kimi',
    urlPatterns: ['kimi.com', 'kimi.moonshot.cn', 'platform.moonshot.cn', 'moonshot.cn'],
    maxContextWindow: 2097152,
  },
}

export interface TokenCount {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheHitTokens: number
}

export interface SessionState {
  sessionId: string
  platform: PlatformName
  conversationKey?: string
  dayKey?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextWindowTokens: number
  messageCount: number
  startTime: number
  lastActive: number
}

export interface QuotaConfig {
  dailyTokenLimit?: number
  platformDailyTokenLimit?: Partial<Record<PlatformName, number>>
}

export interface HourlyTokenUsage {
  hourStart: number
  tokens: number
}

export interface DailyStatsOverview {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface DailyStatsV2 {
  overview: DailyStatsOverview
  byPlatform: Record<PlatformName, DailyStatsOverview>
}

export interface Last24hStatsV2 {
  last24hOverview: HourlyTokenUsage[]
  last24hByPlatform: Record<PlatformName, HourlyTokenUsage[]>
}

export type MessageRequest =
  | { type: 'count_tokens'; platform: PlatformName; text: string }
  | { type: 'record_token_usage'; platform: PlatformName; sessionId?: string; inputTokens?: number; outputTokens?: number; contextWindowTokens?: number }
  | { type: 'count_baseline_tokens'; platform: PlatformName; text: string; systemBase: number; templateOverhead: number; turnCount: number }
  | { type: 'get_session_id'; platform: PlatformName; conversationKey?: string }
  | { type: 'start_session'; platform: PlatformName; conversationKey: string }
  | { type: 'promote_session'; platform: PlatformName; sessionId: string; conversationKey: string }
  | { type: 'get_daily_stats' }
  | { type: 'get_daily_stats_v2' }
  | { type: 'get_last24h_stats' }
  | { type: 'get_last24h_stats_v2' }
  | { type: 'clear_platform_stats'; platform: PlatformName }
  | { type: 'clear_all_stats' }
  | { type: 'get_quota_config' }
  | { type: 'update_quota_config'; config: Partial<QuotaConfig> }

export type MessageResponse =
  | { type: 'token_count'; data: TokenCount }
  | { type: 'baseline_token_count'; data: { tokens: number } }
  | { type: 'usage_recorded'; data: SessionState }
  | { type: 'session_id'; data: { sessionId: string; session: SessionState } }
  | { type: 'daily_stats'; data: { tokens: number } }
  | { type: 'daily_stats_v2'; data: DailyStatsV2 }
  | { type: 'last24h_stats'; data: HourlyTokenUsage[] }
  | { type: 'last24h_stats_v2'; data: Last24hStatsV2 }
  | { type: 'stats_cleared'; data: { scope: 'platform' | 'all'; platform?: PlatformName } }
  | { type: 'quota_config'; data: QuotaConfig }
  | { type: 'quota_config_updated'; data: QuotaConfig }
  | { type: 'error'; message: string }
