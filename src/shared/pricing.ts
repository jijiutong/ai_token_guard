import type { PlatformName } from './types'

export interface PlatformPricing {
  inputPerMillion: number
  outputPerMillion: number
}

export const PRICING: Record<PlatformName, PlatformPricing> = {
  deepseek: { inputPerMillion: 0.5, outputPerMillion: 2.0 },
  yiyan: { inputPerMillion: 0.5, outputPerMillion: 2.0 },
  tongyi: { inputPerMillion: 0.5, outputPerMillion: 2.0 },
  doubao: { inputPerMillion: 0.2, outputPerMillion: 1.0 },
  moonshot: { inputPerMillion: 1.0, outputPerMillion: 3.0 },
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  platform: PlatformName
): number {
  const pricing = PRICING[platform]
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion
  return Math.round((inputCost + outputCost) * 100) / 100
}

export function formatPrice(amount: number): string {
  return `¥${amount.toFixed(2)}`
}
