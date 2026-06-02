export interface ContextHistoryState {
  tokens: number
  turns: number
  fingerprint: string
}

export interface ContextHistorySample {
  tokens: number
  turns: number
  fingerprint: string
}

export type ContextHistoryDecision = 'accepted' | 'ignored_shrink' | 'ignored_empty'

export interface ContextHistoryMergeResult {
  decision: ContextHistoryDecision
  state: ContextHistoryState
}

export function restoreContextHistoryFromWindow(
  trusted: ContextHistoryState,
  contextWindowTokens: number,
  systemBaseTokens: number
): ContextHistoryState {
  const restoredHistoryTokens = Math.max(0, contextWindowTokens - systemBaseTokens)
  if (restoredHistoryTokens <= trusted.tokens) return trusted
  return {
    tokens: restoredHistoryTokens,
    turns: 0,
    fingerprint: trusted.fingerprint,
  }
}

export function mergeContextHistorySample(
  trusted: ContextHistoryState,
  sample: ContextHistorySample
): ContextHistoryMergeResult {
  if (sample.tokens <= 0 || !sample.fingerprint) {
    return {
      decision: 'ignored_empty',
      state: trusted,
    }
  }

  if (trusted.tokens === 0 || sample.tokens > trusted.tokens) {
    return {
      decision: 'accepted',
      state: {
        tokens: sample.tokens,
        turns: sample.turns,
        fingerprint: sample.fingerprint,
      },
    }
  }

  if (sample.tokens === trusted.tokens) {
    return {
      decision: 'accepted',
      state: {
        tokens: sample.tokens,
        turns: Math.max(sample.turns, trusted.turns),
        fingerprint: sample.fingerprint,
      },
    }
  }

  return {
    decision: 'ignored_shrink',
    state: trusted,
  }
}
