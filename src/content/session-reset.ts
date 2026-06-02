import type { PlatformName } from '../shared/types'

interface ResolveConversationKeyOptions {
  platform: PlatformName
  baseKey: string
  hasConversationMessages: boolean
  now: number
  draftConversationNonce: number
}

const EMPTY_CONVERSATION_RESET_PLATFORMS = new Set<PlatformName>([
  'deepseek',
  'yiyan',
  'tongyi',
  'doubao',
  'moonshot',
])

export function shouldCheckEmptyConversationReset(platform: PlatformName): boolean {
  return EMPTY_CONVERSATION_RESET_PLATFORMS.has(platform)
}

export function hasResolvedSessionKey(platform: PlatformName, baseKey: string): boolean {
  return baseKey.startsWith(`${platform}:`) || baseKey.startsWith('ds:')
}

export function resolveConversationKeyForState({
  platform,
  baseKey,
  hasConversationMessages,
  now,
  draftConversationNonce,
}: ResolveConversationKeyOptions): string {
  if (hasResolvedSessionKey(platform, baseKey)) return baseKey

  if (platform === 'yiyan') {
    return `yiyan:draft:${now}:${draftConversationNonce}`
  }
  if (platform === 'deepseek') {
    return `deepseek:draft:${now}:${draftConversationNonce}`
  }
  if (platform === 'moonshot') {
    return `moonshot:draft:${now}:${draftConversationNonce}`
  }
  if (!hasConversationMessages) {
    return `${baseKey}::draft:${now}:${draftConversationNonce}`
  }
  return baseKey
}
