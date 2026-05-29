import type { PlatformName } from './types'
import { PLATFORMS } from './types'

export function detectPlatform(url?: string): PlatformName | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname
    for (const [, config] of Object.entries(PLATFORMS)) {
      if (config.urlPatterns.includes(hostname)) {
        return config.name
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function debounce<T extends (...args: any[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}
