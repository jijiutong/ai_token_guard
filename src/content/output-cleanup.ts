export function stripLeadingUserEcho(delta: string, userCandidates: string[], maxLines = 3): string {
  let clean = delta.trim()
  if (!clean) return ''
  const candidates = userCandidates
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (candidates.length === 0) return clean

  for (let i = 0; i < maxLines; i++) {
    const firstNewline = clean.indexOf('\n')
    const line = (firstNewline >= 0 ? clean.slice(0, firstNewline) : clean).trim()
    if (!line) break
    const matched = candidates.find((user) => line === user || line.startsWith(user))
    if (!matched) break
    if (firstNewline < 0) return ''
    clean = clean.slice(firstNewline + 1).trim()
    if (!clean) return ''
  }

  for (const user of candidates) {
    if (clean.startsWith(user)) {
      clean = clean.slice(user.length).trim()
    }
  }
  return clean
}

export function stripAtgStatsEchoText(text: string): string {
  if (!text) return ''
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const statLike = /输入[\d,\s]+·\s*输出[\d,\s]+·\s*会话[\d,\s]+·\s*上下文[≈~]?[\d,\s]+/u
  if (statLike.test(compact)) return ''
  return text
}

export function shouldAllowAwaitingResetNoDelta(params: {
  awaitingMs: number
  stableMs: number
  consecutiveNoDeltaPolls: number
}): boolean {
  const { awaitingMs, stableMs, consecutiveNoDeltaPolls } = params
  return awaitingMs >= 28000 && stableMs >= 6000 && consecutiveNoDeltaPolls >= 4
}

export function shouldAttemptOutputSelfHeal(params: {
  now: number
  lastSelfHealAttemptAt: number
  lastInputCommittedAt: number
  lastOutputCountedAt: number
  awaitingAssistantReply: boolean
  awaitingStartedAt: number
}): boolean {
  const {
    now,
    lastSelfHealAttemptAt,
    lastInputCommittedAt,
    lastOutputCountedAt,
    awaitingAssistantReply,
    awaitingStartedAt,
  } = params

  if (now - lastSelfHealAttemptAt < 8000) return false
  if (!lastInputCommittedAt) return false
  if (lastOutputCountedAt >= lastInputCommittedAt) return false
  if (now - lastInputCommittedAt < 12000) return false
  if (awaitingAssistantReply && awaitingStartedAt > 0 && now - awaitingStartedAt < 12000) return false
  return true
}
