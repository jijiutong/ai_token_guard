export function normalizeOutputText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createOutputSignature(conversationKey: string, text: string): string {
  return `${conversationKey}:${hashString(normalizeOutputText(text))}`
}

export function getAppendOnlyDelta(baseline: string, current: string): string {
  const cleanBaseline = baseline.trim()
  const cleanCurrent = current.trim()
  if (!cleanCurrent) return ''
  if (!cleanBaseline) return cleanCurrent
  if (cleanCurrent === cleanBaseline) return ''
  if (cleanBaseline.includes(cleanCurrent)) return ''
  if (cleanCurrent.startsWith(cleanBaseline)) {
    return cleanCurrent.slice(cleanBaseline.length).trim()
  }

  const overlap = longestCommonPrefixLen(cleanBaseline, cleanCurrent)
  if (overlap >= 16 && overlap < cleanCurrent.length) {
    return cleanCurrent.slice(overlap).trim()
  }

  const baselineIndex = cleanCurrent.indexOf(cleanBaseline)
  if (baselineIndex >= 0) {
    return cleanCurrent.slice(baselineIndex + cleanBaseline.length).trim()
  }

  return ''
}

export function getTailWindowDelta(baseline: string, current: string, minTail = 8): string {
  const cleanBaseline = baseline.trim()
  const cleanCurrent = current.trim()
  if (!cleanCurrent) return ''
  if (!cleanBaseline) return cleanCurrent
  if (cleanCurrent === cleanBaseline) return ''
  if (cleanCurrent.length <= cleanBaseline.length) return ''

  const maxProbe = Math.min(cleanBaseline.length, cleanCurrent.length)
  for (let probe = maxProbe; probe >= Math.max(minTail, 8); probe -= 1) {
    const suffix = cleanBaseline.slice(-probe)
    const idx = cleanCurrent.lastIndexOf(suffix)
    if (idx < 0) continue
    const delta = cleanCurrent.slice(idx + probe).trim()
    if (delta) return delta
  }
  return ''
}

function longestCommonPrefixLen(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let i = 0
  while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) i += 1
  return i
}
