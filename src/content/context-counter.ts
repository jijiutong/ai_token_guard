export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export function collectConversationMessages(blocks: Element[], assistantBlocks: Element[] = []): ConversationMessage[] {
  const valid: Element[] = []
  for (const block of blocks) {
    if (!isElementEligible(block)) continue
    const text = block.textContent?.trim() || ''
    if (text.length < 2) continue
    const classes = (block as HTMLElement).className || ''
    if (classes.includes('button') || classes.includes('action') || classes.includes('copy')) continue
    valid.push(block)
  }

  const assistantSet = buildAssistantSet(assistantBlocks)
  return valid.map((el, index) => ({
    role: detectRole(el, index, valid, assistantSet),
    content: el.textContent?.trim() || '',
  }))
}

export function collectAssistantTexts(blocks: Element[]): string[] {
  const texts: string[] = []
  for (const block of blocks) {
    if (!isElementEligible(block)) continue
    const text = block.textContent?.trim() || ''
    if (text.length < 2) continue
    const classes = (block as HTMLElement).className || ''
    if (classes.includes('button') || classes.includes('action') || classes.includes('copy')) continue
    texts.push(text)
  }
  return Array.from(new Set(texts))
}

export function buildContextText(
  messages: ConversationMessage[],
  currentInput: string
): { rawText: string; turnCount: number } {
  const parts = messages.map((msg) => msg.content)
  const hasCurrentInput = Boolean(currentInput.trim())
  if (hasCurrentInput) parts.push(currentInput.trim())
  return {
    rawText: parts.join('\n'),
    turnCount: messages.length + (hasCurrentInput ? 1 : 0),
  }
}

export function buildAssistantText(messages: ConversationMessage[]): string {
  return messages
    .filter((msg) => msg.role === 'assistant')
    .map((msg) => msg.content)
    .join('\n')
    .trim()
}

function isElementEligible(el: Element): boolean {
  const htmlEl = el as HTMLElement
  if (!htmlEl.isConnected) return false
  if (htmlEl.closest('header, nav, aside, footer, button, [role="button"], [aria-hidden="true"]')) return false
  const style = window.getComputedStyle(htmlEl)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (htmlEl.offsetParent === null && style.position !== 'fixed') return false
  return true
}

function detectRole(
  el: Element,
  index: number,
  all: Element[],
  assistantSet: Set<Element>
): 'user' | 'assistant' {
  if (assistantSet.has(el)) return 'assistant'
  const html = el as HTMLElement
  const classSig = `${html.className || ''} ${html.getAttribute('data-role') || ''} ${html.getAttribute('data-testid') || ''}`.toLowerCase()

  if (/\bassistant\b|\banswer\b|\bbot\b|\bmodel\b|\bai\b|\breply\b/.test(classSig)) return 'assistant'
  if (/\buser\b|\bquestion\b|\bask\b|\bquery\b|\bprompt\b/.test(classSig)) return 'user'

  const ariaLabel = (html.getAttribute('aria-label') || '').toLowerCase()
  if (/\bassistant\b|\bai\b/.test(ariaLabel)) return 'assistant'
  if (/\buser\b|\b我\b/.test(ariaLabel)) return 'user'

  // Fallback: infer by horizontal position (right side is usually user bubble).
  const rect = html.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const rightBiased = centerX > window.innerWidth * 0.58
  if (rightBiased) return 'user'

  // Last fallback keeps previous behavior deterministic.
  if (index > 0) {
    const prev = all[index - 1] as HTMLElement
    const prevRole = detectRoleFromPosition(prev)
    if (prevRole) return prevRole === 'user' ? 'assistant' : 'user'
  }
  return index % 2 === 0 ? 'user' : 'assistant'
}

function detectRoleFromPosition(el: HTMLElement): 'user' | 'assistant' | null {
  const rect = el.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  if (centerX > window.innerWidth * 0.58) return 'user'
  if (centerX < window.innerWidth * 0.5) return 'assistant'
  return null
}

function buildAssistantSet(assistantBlocks: Element[]): Set<Element> {
  const set = new Set<Element>()
  for (const node of assistantBlocks) {
    set.add(node)
    let parent: Element | null = node.parentElement
    let guard = 0
    while (parent && guard < 6) {
      set.add(parent)
      parent = parent.parentElement
      guard += 1
    }
  }
  return set
}
