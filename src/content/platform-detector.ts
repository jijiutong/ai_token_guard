import type { PlatformName } from '../shared/types'
import { getStrategyByHostname } from './platform-strategy'

export function detectCurrentPlatform(): PlatformName | null {
  return getStrategyByHostname(window.location.hostname)?.platform || null
}

export function isTargetPlatform(): boolean {
  return getStrategyByHostname(window.location.hostname) !== null
}
