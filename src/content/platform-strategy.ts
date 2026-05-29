import type { PlatformName } from '../shared/types'

export type MissingNodeType = 'input' | 'assistant' | 'sendButton'

export interface PlatformReadyState {
  ready: boolean
  missing: MissingNodeType[]
}

export interface PlatformStrategy {
  platform: PlatformName
  hostnames: string[]
  maxContextWindow: number
  findInput(): HTMLTextAreaElement | HTMLElement | null
  readInput(el: HTMLTextAreaElement | HTMLElement): string
  findAssistantBlocks(): Element[]
  findConversationBlocks(): Element[]
  findSendButton(): Element | null
  isReady(): PlatformReadyState
  getIgnoredSnippets(): string[]
  sessionKeyResolver(hostname: string, path: string, search: string, hash: string): string
}

type StrategyConfig = {
  platform: PlatformName
  hostnames: string[]
  maxContextWindow: number
  inputSelectors: string[]
  assistantSelectors: string[]
  conversationSelectors: string[]
  sendButtonSelectors: string[]
  sessionKeyResolver?: (hostname: string, path: string, search: string, hash: string) => string
}

function extractSessionId(path: string, search: string, hash: string, patterns: RegExp[], queryKeys: string[]): string | null {
  for (const pattern of patterns) {
    const match = path.match(pattern)
    if (match?.[1]) return match[1]
  }
  const params = new URLSearchParams(search)
  for (const key of queryKeys) {
    const value = params.get(key)
    if (value) return value
  }
  const hashValue = hash.startsWith('#') ? hash.slice(1) : hash
  if (hashValue) {
    const hashParams = new URLSearchParams(hashValue)
    for (const key of queryKeys) {
      const value = hashParams.get(key)
      if (value) return value
    }
    const hashMatch = hashValue.match(/(?:conversation|session|chat|sid|conv)[=/:]([a-zA-Z0-9_-]+)/i)
    if (hashMatch?.[1]) return hashMatch[1]
  }
  return null
}

function findBySelectors(selectors: string[]): HTMLElement | null {
  const roots = collectSearchRoots()
  for (const selector of selectors) {
    for (const root of roots) {
      const el = root.querySelector(selector) as HTMLElement | null
      if (el) return el
    }
  }
  return null
}

function findAllBySelectors(selectors: string[]): Element[] {
  const dedup = new Set<Element>()
  const roots = collectSearchRoots()
  for (const selector of selectors) {
    for (const root of roots) {
      root.querySelectorAll(selector).forEach((el) => dedup.add(el))
    }
  }
  return Array.from(dedup)
}

function textLooksIgnored(text: string, ignoredSnippets: string[]): boolean {
  if (!text) return true
  const lower = text.toLowerCase()
  return ignoredSnippets.some((snippet) => lower.includes(snippet))
}

function filterUsefulBlocks(blocks: Element[], ignoredSnippets: string[] = []): Element[] {
  const candidates = blocks.filter((el) => {
    const html = el as HTMLElement
    if (!isVisible(html)) return false
    if (html.closest('button, [role="button"], nav, header, footer, aside')) return false
    const text = (html.textContent || '').trim()
    if (text.length < 2 || text.length > 4000) return false
    if (textLooksIgnored(text, ignoredSnippets)) return false
    const rect = html.getBoundingClientRect()
    if (rect.width < 60 || rect.height < 16) return false
    return true
  })

  const leafCandidates = candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)))
  leafCandidates.sort((a, b) => (a as HTMLElement).getBoundingClientRect().top - (b as HTMLElement).getBoundingClientRect().top)
  return leafCandidates
}

function totalTextLen(blocks: Element[]): number {
  return blocks.reduce((sum, el) => sum + ((el.textContent || '').trim().length), 0)
}

function hasConversationScaffold(): boolean {
  const roots = collectSearchRoots()
  const selectors = [
    '[class*="chat"]',
    '[class*="conversation"]',
    '[class*="message-list"]',
    '[class*="dialog"]',
    '[data-testid*="chat"]',
    '[data-testid*="conversation"]',
    'main',
  ]
  for (const root of roots) {
    for (const selector of selectors) {
      const node = root.querySelector(selector) as HTMLElement | null
      if (!node) continue
      if (!isVisible(node)) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 180 || rect.height < 120) continue
      return true
    }
  }
  return false
}

function collectSearchRoots(): ParentNode[] {
  const roots: ParentNode[] = [document]
  const stack: Element[] = Array.from(document.querySelectorAll('*'))
  while (stack.length) {
    const el = stack.pop() as Element
    const shadow = (el as HTMLElement).shadowRoot
    if (!shadow) continue
    roots.push(shadow)
    stack.push(...Array.from(shadow.querySelectorAll('*')))
  }
  return roots
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

function isLikelyChatInputElement(el: HTMLElement): boolean {
  if (!isVisible(el)) return false
  const tag = el.tagName.toLowerCase()
  const isTextarea = tag === 'textarea'
  const isInput = tag === 'input'
  const isEditable = el.getAttribute('contenteditable') === 'true'
  const isTextboxRole = (el.getAttribute('role') || '').toLowerCase() === 'textbox'
  if (!isTextarea && !isInput && !(isEditable || isTextboxRole)) return false

  if ((el as HTMLInputElement).disabled) return false
  if ((el as HTMLInputElement).readOnly) return false

  const rect = el.getBoundingClientRect()
  if (rect.width < 120 || rect.height < 24) return false
  const sig = `${el.getAttribute('placeholder') || ''} ${el.className || ''} ${el.getAttribute('data-testid') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase()
  const viewportHeight = Math.max(window.innerHeight || 0, 1)
  const inLowerHalf = rect.top >= viewportHeight * 0.38
  if (/message|chat|input|发送|提问|请输入|问|ask|send/.test(sig)) {
    return inLowerHalf || rect.width > 300
  }

  // Fallback for clean UIs without obvious labels.
  return (isTextarea || isEditable || isTextboxRole) && inLowerHalf
}

function normalizeInputText(raw: string): string {
  return raw.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim()
}

function isLikelyInputPlaceholderText(text: string): boolean {
  if (!text) return false
  const normalized = normalizeInputText(text).toLowerCase()
  return (
    normalized.includes('你需要什么帮助') ||
    normalized.includes('深度分析需求并解答') ||
    normalized.includes('给kimi发送消息') ||
    normalized.includes('继续追问') ||
    normalized.includes('向千问提问') ||
    normalized.includes('请输入') ||
    normalized.includes('输入问题') ||
    normalized.includes('开始提问') ||
    normalized.includes('有什么可以帮你')
  )
}

function readInputText(el: HTMLTextAreaElement | HTMLElement): string {
  if ('value' in el) {
    const value = normalizeInputText((el as HTMLTextAreaElement).value || '')
    if (isLikelyInputPlaceholderText(value)) return ''
    return value
  }

  const html = el as HTMLElement
  let text = normalizeInputText(html.innerText || html.textContent || '')
  const placeholder = normalizeInputText(
    html.getAttribute('placeholder')
    || html.getAttribute('aria-placeholder')
    || html.getAttribute('data-placeholder')
    || html.getAttribute('aria-label')
    || ''
  )

  // Some editors render placeholder as real text node.
  if (placeholder && text === placeholder) return ''
  if (isLikelyInputPlaceholderText(text)) return ''
  return text
}

function findGenericInputFallback(keywords: string[]): HTMLElement | null {
  const roots = collectSearchRoots()
  const candidates: HTMLElement[] = []
  const keywordPattern = new RegExp(keywords.join('|'), 'i')

  for (const root of roots) {
    root.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]').forEach((node) => {
      const el = node as HTMLElement
      if (!isVisible(el)) return
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase()
      const cls = (el.className || '').toString().toLowerCase()
      const id = (el.id || '').toLowerCase()
      const testId = (el.getAttribute('data-testid') || '').toLowerCase()
      const sig = `${placeholder} ${cls} ${id} ${testId}`
      if (keywordPattern.test(sig)) {
        candidates.push(el)
      }
    })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const ar = a.getBoundingClientRect()
    const br = b.getBoundingClientRect()
    return br.bottom - ar.bottom
  })
  return candidates[0] || null
}

function findGenericAssistantFallback(conversationSelectors: string[], ignoredSnippets: string[] = []): Element[] {
  const blocks = findAllBySelectors(conversationSelectors) as HTMLElement[]
  const viewportMid = window.innerWidth * 0.58
  const preliminary: HTMLElement[] = []

  for (const block of blocks) {
    if (!isVisible(block)) continue
    const text = (block.textContent || '').trim()
    if (text.length < 2) continue
    if (text.length > 4000) continue
    const lower = text.toLowerCase()
    if (ignoredSnippets.some((snippet) => lower.includes(snippet))) continue
    if (block.closest('button, [role="button"], nav, header, footer, aside')) continue

    const rect = block.getBoundingClientRect()
    if (rect.width < 80 || rect.height < 20) continue
    const nestedMsgLike = Array.from(
      block.querySelectorAll('[class*="message"], [class*="chat-item"], [class*="bubble"]')
    ).filter((el) => {
      if (el === block) return false
      const child = el as HTMLElement
      if (!isVisible(child)) return false
      const childText = (child.textContent || '').trim()
      return childText.length > 12
    })
    if (nestedMsgLike.length >= 2) continue

    const centerX = rect.left + rect.width / 2
    const likelyAssistant = centerX <= viewportMid
    if (!likelyAssistant) continue

    preliminary.push(block)
  }

  // Keep leaf-most candidates to avoid selecting a large wrapper that swallows
  // many turns and stays almost unchanged (causing delta=0).
  const leafCandidates = preliminary.filter((el) => {
    return !preliminary.some((other) => other !== el && other.contains(el))
  })

  // Sort in visual order (top -> bottom), so caller can use the last one as latest reply.
  leafCandidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return leafCandidates
}

function findGenericConversationFallback(): Element[] {
  const selectors = [
    '[class*="message"]',
    '[class*="chat-item"]',
    '[class*="bubble"]',
    '[data-role*="message"]',
    '[data-testid*="message"]',
  ]
  const blocks = findAllBySelectors(selectors) as HTMLElement[]
  const candidates: HTMLElement[] = []

  for (const block of blocks) {
    if (!isVisible(block)) continue
    const text = (block.textContent || '').trim()
    if (text.length < 2 || text.length > 6000) continue
    if (block.closest('header, nav, footer, aside, button, [role="button"]')) continue
    candidates.push(block)
  }

  const leafCandidates = candidates.filter((el) => !candidates.some((other) => other !== el && other.contains(el)))
  leafCandidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return leafCandidates
}

function findGenericSendButtonFallback(): Element | null {
  const selectors = [
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    '[role="button"][aria-label*="发送"]',
    '[role="button"][aria-label*="Send"]',
    'button[data-testid*="send"]',
  ]
  const direct = findBySelectors(selectors)
  if (direct) return direct
  const allButtons = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[]
  return allButtons.find((el) => {
    if (!isVisible(el)) return false
    const label = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.toLowerCase()
    return /发送|send|提交|submit|arrow/.test(label)
  }) || null
}

const PLATFORM_IGNORED_SNIPPETS: Record<PlatformName, string[]> = {
  deepseek: [
    '内容由ai生成',
    '仅供参考',
    '免责声明',
    '继续追问',
    '相关问题',
    '重新生成',
    '复制',
  ],
  yiyan: [
    '内容由ai生成',
    '仅供参考',
    '免责声明',
    '继续追问',
    '相关问题',
    '重新生成',
    '复制',
    '大家都在问',
    '为你推荐',
    '换个话题',
    '猜你想问',
    '点击发送',
    '按enter发送',
  ],
  tongyi: [
    '内容由ai生成',
    '仅供参考',
    '免责声明',
    '继续追问',
    '相关问题',
    '重新生成',
    '复制',
  ],
  doubao: [
    '问候与聊天邀约内容由豆包 ai 生成',
    '下载电脑版',
    '请仔细甄别',
    '内容由ai生成',
    '免责声明',
    '继续追问',
    '相关问题',
    '重新生成',
    '复制',
  ],
  moonshot: [
    '内容由ai生成',
    '仅供参考',
    '免责声明',
    '继续追问',
    '深度分析需求并解答',
    '你需要什么帮助',
    '你需要什么帮助?',
    '你需要什么帮助？',
    '给kimi发送消息',
    '猜你想问',
    '你可以试试',
    '示例问题',
    '开始新对话',
    '相关问题',
    '重新生成',
    '复制',
  ],
}

function createStrategy(config: StrategyConfig): PlatformStrategy {
  return {
    platform: config.platform,
    hostnames: config.hostnames,
    maxContextWindow: config.maxContextWindow,
    findInput() {
      const matched = findBySelectors(config.inputSelectors) as HTMLTextAreaElement | HTMLElement | null
      if (matched && isLikelyChatInputElement(matched)) return matched
      const platformKeywords: Record<PlatformName, string[]> = {
        deepseek: ['deepseek', 'input', 'message', 'send', 'chat', '提问', '输入', '发送', '对话'],
        yiyan: ['文心', 'baidu', 'input', 'message', 'send', 'chat', '提问', '输入', '发送', '对话'],
        tongyi: ['通义', 'qianwen', 'input', 'message', 'send', 'chat', '提问', '输入', '发送', '对话'],
        doubao: ['豆包', 'input', 'message', 'send', 'chat', '提问', '输入', '发送', '对话'],
        moonshot: ['kimi', 'moonshot', 'input', 'message', 'send', 'chat', '提问', '输入', '发送', '对话'],
      }
      const fallback = findGenericInputFallback(platformKeywords[config.platform])
      if (fallback && isLikelyChatInputElement(fallback)) return fallback
      return null
    },
    readInput(el: HTMLTextAreaElement | HTMLElement) {
      return readInputText(el)
    },
    findAssistantBlocks() {
      const ignored = PLATFORM_IGNORED_SNIPPETS[config.platform] || []
      const matched = filterUsefulBlocks(findAllBySelectors(config.assistantSelectors), ignored)
      const fallback = findGenericAssistantFallback(config.conversationSelectors, ignored)
      if (matched.length === 0) return fallback
      if (fallback.length === 0) return matched
      // Prefer the set that carries richer text payload, to avoid static wrappers.
      const matchedLen = totalTextLen(matched)
      const fallbackLen = totalTextLen(fallback)
      return fallbackLen > matchedLen * 1.15 ? fallback : matched
    },
    findConversationBlocks() {
      const ignored = PLATFORM_IGNORED_SNIPPETS[config.platform] || []
      const matched = filterUsefulBlocks(findAllBySelectors(config.conversationSelectors), ignored)
      const fallback = findGenericConversationFallback()
      if (matched.length === 0) return fallback
      if (fallback.length === 0) return matched
      const matchedLen = totalTextLen(matched)
      const fallbackLen = totalTextLen(fallback)
      // Some sites (notably Yiyan) may return stable wrapper nodes for
      // strategy selectors. Prefer the richer fallback set when it clearly
      // carries more conversational text.
      const fallbackRicher = fallbackLen > matchedLen * 1.2 || fallback.length > matched.length + 2
      return fallbackRicher ? fallback : matched
    },
    findSendButton() {
      const matched = findBySelectors(config.sendButtonSelectors)
      if (matched) return matched
      return findGenericSendButtonFallback()
    },
    isReady() {
      const missing: MissingNodeType[] = []
      const input = this.findInput()
      const assistantBlocks = this.findAssistantBlocks()
      const conversationBlocks = this.findConversationBlocks()
      if (!input) missing.push('input')
      const allowEmptyConversation = (
        config.platform === 'tongyi' ||
        config.platform === 'deepseek' ||
        config.platform === 'moonshot'
      )
      if (!allowEmptyConversation && assistantBlocks.length === 0 && conversationBlocks.length === 0 && !hasConversationScaffold()) {
        missing.push('assistant')
      }
      if (!this.findSendButton()) missing.push('sendButton')
      return { ready: !missing.includes('input') && !missing.includes('assistant'), missing }
    },
    getIgnoredSnippets() {
      return PLATFORM_IGNORED_SNIPPETS[config.platform] || []
    },
    sessionKeyResolver(hostname: string, path: string, search: string, hash: string) {
      if (config.sessionKeyResolver) return config.sessionKeyResolver(hostname, path, search, hash)
      return `${hostname}${path}${search}${hash}`
    },
  }
}

const commonSendButtons = [
  'button[type="submit"]',
  '[role="button"][type="submit"]',
  'button[aria-label*="发送"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="提交"]',
  'button[data-testid*="send"]',
  '[data-testid*="submit"]',
  '[role="button"][aria-label*="发送"]',
  '[role="button"][aria-label*="Send"]',
]

const deepseek = createStrategy({
  platform: 'deepseek',
  hostnames: ['chat.deepseek.com', 'www.deepseek.com'],
  maxContextWindow: 131072,
  inputSelectors: [
    '[data-role="user-input"]',
    'div[data-testid="user-input"][contenteditable="true"]',
    'textarea[placeholder*="DeepSeek"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="发送"]',
    '[data-testid*="chat-input"] textarea',
    '[class*="input"] textarea',
    'div[contenteditable="true"][role="textbox"]',
  ],
  assistantSelectors: [
    'div.ds-markdown',
    '[data-role="assistant"] .ds-markdown',
    '[class*="assistant"] div.ds-markdown',
    '[class*="assistant"] [class*="markdown"]',
    '[data-testid*="assistant"] [class*="markdown"]',
    '[class*="answer"] [class*="markdown"]',
  ],
  conversationSelectors: [
    'div.ds-markdown',
    '[class*="message"][class*="assistant"]',
    '[class*="message"][class*="user"]',
    '[data-testid*="message"]',
    '[class*="chat-message"]',
    '[class*="bubble"]',
  ],
  sendButtonSelectors: commonSendButtons,
  sessionKeyResolver(_hostname, path, search, hash) {
    const sid = extractSessionId(
      path,
      search,
      hash,
      [
        /\/a\/chat\/s\/([^/?#]+)/,
        /\/chat\/([^/?#]+)/,
        /\/conversation\/([^/?#]+)/,
      ],
      ['conversationId', 'sessionId', 'chatId', 'sid', 'id']
    )
    if (sid) return `ds:${sid}`
    return `chat.deepseek.com${path}`
  },
})

const yiyan = createStrategy({
  platform: 'yiyan',
  hostnames: ['yiyan.baidu.com', 'chat.baidu.com'],
  maxContextWindow: 65536,
  inputSelectors: [
    'textarea[placeholder*="文心"]',
    'textarea[placeholder*="请输入"]',
    'textarea[placeholder*="发送"]',
    '[data-testid*="chat-input"] textarea',
    '[class*="input"] textarea',
    'div[contenteditable="true"][role="textbox"]',
  ],
  assistantSelectors: [
    '[data-role="assistant"]',
    '[data-testid*="assistant"]',
    '[class*="assistant-message"] [class*="markdown"]',
    '[class*="assistant"] [class*="content"]',
    '[class*="assistant-message"]',
    '[class*="bot"] [class*="content"]',
    '[class*="answer"] [class*="content"]',
    '[class*="response"] [class*="content"]',
  ],
  conversationSelectors: [
    '[data-role="assistant"]',
    '[data-role="user"]',
    '[class*="assistant-message"]',
    '[class*="user-message"]',
    '[class*="chat-item"]',
    '[class*="message"]',
    '[class*="message-content"]',
    '[class*="markdown"]',
    '[class*="segment"]',
    '[class*="content"]',
    '[data-testid*="message"]',
    '[data-testid*="markdown"]',
    '[class*="chat-message"]',
    '[class*="bubble"]',
    '[class*="conversation"] [class*="item"]',
    'article',
  ],
  sendButtonSelectors: commonSendButtons,
  sessionKeyResolver(hostname, path, search, hash) {
    const sid = extractSessionId(
      path,
      search,
      hash,
      [
        /\/chat\/([^/?#]+)/,
        /\/conversation\/([^/?#]+)/,
        /\/session\/([^/?#]+)/,
      ],
      ['conversationId', 'sessionId', 'sid', 'chatId', 'id']
    )
    if (sid) return `yiyan:${sid}`
    return `${hostname}${path}${search}${hash}`
  },
})

const tongyi = createStrategy({
  platform: 'tongyi',
  hostnames: [
    'tongyi.aliyun.com',
    'qianwen.aliyun.com',
    'tongyi.com',
    'www.tongyi.com',
    'qianwen.com',
    'www.qianwen.com',
  ],
  maxContextWindow: 131072,
  inputSelectors: [
    'textarea[placeholder*="向千问提问"]',
    'textarea[placeholder*="千问"]',
    'textarea[placeholder*="通义"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="提问"]',
    '[data-testid*="chat-input"] textarea',
    '[class*="chat-input"] textarea',
    '[class*="composer"] textarea',
    '[class*="input"] textarea',
    'div[contenteditable="true"][aria-label*="千问"]',
    'div[contenteditable="true"][aria-placeholder*="千问"]',
    '[class*="chat-input"] [contenteditable="true"]',
    '[class*="composer"] [contenteditable="true"]',
    '[class*="input"] [contenteditable="true"]',
    'div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ],
  assistantSelectors: [
    '[data-role="assistant"]',
    '[data-testid*="assistant"]',
    '[class*="assistant"] [class*="markdown"]',
    '[class*="answer"] [class*="markdown"]',
    '[class*="response"] [class*="markdown"]',
    '[class*="bot"] [class*="markdown"]',
    '[class*="message-content"]',
  ],
  conversationSelectors: [
    '[class*="message"]',
    '[class*="chat-item"]',
    '[class*="message-content"]',
    '[class*="markdown"]',
    '[class*="segment"]',
    '[class*="content"]',
    '[data-testid*="message"]',
    '[data-testid*="markdown"]',
    '[class*="chat-message"]',
    '[class*="bubble"]',
    'article',
  ],
  sendButtonSelectors: [
    ...commonSendButtons,
    'button[aria-label*="发送消息"]',
    'button[aria-label*="提问"]',
    '[class*="send"] button',
    '[class*="submit"] button',
    '[class*="composer"] button:has(svg)',
  ],
  sessionKeyResolver(hostname, path, search, hash) {
    const sid = extractSessionId(
      path,
      search,
      hash,
      [
        /\/chat\/([^/?#]+)/,
        /\/conversation\/([^/?#]+)/,
        /\/session\/([^/?#]+)/,
      ],
      ['conversationId', 'sessionId', 'chatId', 'sid', 'id']
    )
    if (sid) return `tongyi:${sid}`
    return `${hostname}${path}${search}${hash}`
  },
})

const doubao = createStrategy({
  platform: 'doubao',
  hostnames: ['www.doubao.com', 'doubao.com'],
  maxContextWindow: 65536,
  inputSelectors: [
    'textarea[placeholder*="给豆包发送消息"]',
    'textarea[placeholder*="发送消息"]',
    'textarea[placeholder*="豆包"]',
    'textarea[placeholder*="输入"]',
    'textarea[data-testid*="chat"]',
    '[data-testid*="chat-input"] textarea',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][data-testid*="input"]',
    '[class*="chat-input"] [contenteditable="true"]',
    '[class*="input"] [contenteditable="true"]',
  ],
  assistantSelectors: [
    '[data-role="assistant"]',
    '[data-testid*="assistant"]',
    '[class*="assistant"]',
    '[class*="answer"]',
    '[class*="bot"]',
    '[class*="ai-message"]',
    '[class*="markdown"]',
  ],
  conversationSelectors: [
    '[class*="message"]',
    '[class*="bubble"]',
    '[class*="chat-item"]',
  ],
  sendButtonSelectors: [
    ...commonSendButtons,
    'button[aria-label*="发送消息"]',
    'button[data-testid*="send"]',
    '[class*="send"] button',
    'button:has(svg)',
  ],
  sessionKeyResolver(hostname, path, search, hash) {
    const sid = extractSessionId(
      path,
      search,
      hash,
      [
        /\/chat\/([^/?#]+)/,
        /\/conversation\/([^/?#]+)/,
        /\/session\/([^/?#]+)/,
      ],
      ['conversationId', 'sessionId', 'chatId', 'sid', 'id']
    )
    if (sid) return `doubao:${sid}`
    return `${hostname}${path}${search}${hash}`
  },
})

const moonshot = createStrategy({
  platform: 'moonshot',
  hostnames: ['platform.moonshot.cn', 'kimi.moonshot.cn', 'kimi.com', 'www.kimi.com'],
  maxContextWindow: 2097152,
  inputSelectors: [
    'textarea[placeholder*="Kimi"]',
    'textarea[placeholder*="kimi"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="发送"]',
    'textarea[placeholder*="提问"]',
    'textarea[placeholder*="请输入"]',
    '[data-testid*="chat-input"] textarea',
    '[class*="chat-input"] textarea',
    '[class*="composer"] textarea',
    '[class*="input"] textarea',
    'div[contenteditable="true"][aria-label*="Kimi"]',
    'div[contenteditable="true"][aria-label*="kimi"]',
    '[class*="chat-input"] [contenteditable="true"]',
    '[class*="composer"] [contenteditable="true"]',
    '[class*="input"] [contenteditable="true"]',
    'div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ],
  assistantSelectors: [
    '[data-role="assistant"]',
    '[data-testid*="assistant"]',
    '[class*="assistant"] [class*="markdown"]',
    '[class*="answer"] [class*="markdown"]',
    '[class*="response"] [class*="markdown"]',
    '[class*="bot"] [class*="markdown"]',
    '[class*="message-content"]',
  ],
  conversationSelectors: [
    '[class*="message"]',
    '[class*="chat-item"]',
    '[class*="message-content"]',
    '[class*="markdown"]',
    '[class*="segment"]',
    '[class*="content"]',
    '[data-testid*="message"]',
    '[data-testid*="markdown"]',
    '[class*="chat-message"]',
    '[class*="bubble"]',
    'article',
  ],
  sendButtonSelectors: [
    ...commonSendButtons,
    'button[aria-label*="发送消息"]',
    'button[aria-label*="发送"]',
    '[class*="send"] button',
    '[class*="submit"] button',
    '[class*="composer"] button:has(svg)',
  ],
  sessionKeyResolver(hostname, path, search, hash) {
    const sid = extractSessionId(
      path,
      search,
      hash,
      [
        /\/chat\/([^/?#]+)/,
        /\/conversation\/([^/?#]+)/,
        /\/session\/([^/?#]+)/,
      ],
      ['conversationId', 'sessionId', 'chatId', 'sid', 'id']
    )
    if (sid) return `moonshot:${sid}`
    return `${hostname}${path}${search}${hash}`
  },
})

export const PLATFORM_STRATEGIES: PlatformStrategy[] = [deepseek, yiyan, tongyi, doubao, moonshot]

export const PLATFORM_STRATEGY_MAP: Record<PlatformName, PlatformStrategy> = {
  deepseek,
  yiyan,
  tongyi,
  doubao,
  moonshot,
}

export function getStrategyByHostname(hostname: string): PlatformStrategy | null {
  return PLATFORM_STRATEGIES.find((strategy) => strategy.hostnames.includes(hostname)) || null
}
