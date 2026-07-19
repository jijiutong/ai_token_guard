import {
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODE_KEY,
  normalizeDisplayMode,
  type FloatingDisplayMode,
} from '../shared/display-mode'

type SessionStats = {
  currentInputTokens: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextWindowTokens: number
}

type FloatingState = {
  question: string
  isThinking: boolean
}

type Position = { x: number; y: number }

type PetMood =
  | 'idle'
  | 'happy'
  | 'sleepy'
  | 'surprised'
  | 'shy'
  | 'thinking'
  | 'angry'
  | 'peek'
  | 'jump'
  | 'spin'
  | 'sit'

const PET_POS_KEY = 'atg:pet:position:v1'
const COMPACT_POS_KEY = 'atg:bar:position:v1'
const PET_W = 112
const PET_H = 116
const PET_LAYOUT_H = PET_H + 84
const COMPACT_W = 340
const COMPACT_H = 44
const EDGE_MARGIN = 28

const BLUE_PET_BEHAVIORS: Array<{ text: string; mood: PetMood }> = [
  { text: '准备就绪', mood: 'idle' },
  { text: '偷偷看鼠标', mood: 'peek' },
  { text: '歪头发呆', mood: 'thinking' },
  { text: '轻轻呼吸', mood: 'idle' },
  { text: '探出脑袋', mood: 'peek' },
  { text: '假装摔倒', mood: 'jump' },
  { text: '蹦一下站稳', mood: 'jump' },
  { text: '躲到边缘偷看', mood: 'peek' },
  { text: '摇摇小短腿', mood: 'happy' },
  { text: '抖抖云朵脑袋', mood: 'happy' },
  { text: '闭眼冥想', mood: 'sleepy' },
  { text: '眯眼微笑', mood: 'happy' },
  { text: '鼓脸卖萌', mood: 'shy' },
  { text: '小步挪动', mood: 'idle' },
  { text: '抱腿坐下', mood: 'sit' },
  { text: '仰头看天', mood: 'thinking' },
  { text: '低头思考', mood: 'thinking' },
  { text: '转圈开心', mood: 'spin' },
  { text: '捂脸害羞', mood: 'shy' },
  { text: '伸懒腰', mood: 'happy' },
  { text: '拍拍肚子', mood: 'happy' },
  { text: '轻轻打哈欠', mood: 'sleepy' },
  { text: '困困点头', mood: 'sleepy' },
  { text: '梦里说话', mood: 'sleepy' },
  { text: '睡觉流口水', mood: 'sleepy' },
  { text: '惊醒眨眼', mood: 'surprised' },
  { text: '左右张望', mood: 'peek' },
  { text: '追逐光标', mood: 'happy' },
  { text: '绕圈巡逻', mood: 'spin' },
  { text: '停下喘气', mood: 'idle' },
  { text: '蹲下蓄力', mood: 'sit' },
  { text: '弹跳一下', mood: 'jump' },
  { text: '连跳两下', mood: 'jump' },
  { text: '摇头晃脑', mood: 'happy' },
  { text: '慢慢后退', mood: 'peek' },
  { text: '突然前探', mood: 'surprised' },
  { text: '贴边躲猫猫', mood: 'peek' },
  { text: '探出半个脑袋', mood: 'peek' },
  { text: '缩成小团', mood: 'sit' },
  { text: '恢复圆滚滚', mood: 'happy' },
  { text: '抬手打招呼', mood: 'happy' },
  { text: '比心一下', mood: 'shy' },
  { text: '送出小爱心', mood: 'shy' },
  { text: '假装生气', mood: 'angry' },
  { text: '秒变开心', mood: 'happy' },
  { text: '偷偷笑', mood: 'happy' },
  { text: '认真工作', mood: 'thinking' },
  { text: '迷糊一下', mood: 'surprised' },
  { text: '酷酷待机', mood: 'idle' },
  { text: '安静守护', mood: 'idle' },
]

export class FloatingBar {
  private bar: HTMLElement | null = null
  private thoughtTextEl: HTMLElement | null = null
  private thoughtStatsEl: HTMLElement | null = null
  private thoughtBubbleEl: HTMLElement | null = null
  private thoughtSpinnerEl: HTMLElement | null = null
  private petSpriteEl: HTMLElement | null = null
  private faceEl: HTMLElement | null = null
  private statusDotEl: HTMLElement | null = null
  private dragOffsetX = 0
  private dragOffsetY = 0
  private behaviorTimer: number | null = null
  private mouseMoveBound = false
  private latestState: FloatingState = { question: '', isThinking: false }
  private currentMood: PetMood = 'idle'
  private displayMode: FloatingDisplayMode = DEFAULT_DISPLAY_MODE
  private storageListenerBound = false

  mount(_anchorElement: HTMLElement) {
    this.destroy()
    this.injectStyles()

    this.bar = document.createElement('div')
    this.bar.id = 'ai-token-guard-bar'
    this.bar.style.cssText = `
      position: fixed !important;
      z-index: 2147483647 !important;
      left: 0 !important;
      top: 0 !important;
      width: ${COMPACT_W}px !important;
      height: ${COMPACT_H}px !important;
      pointer-events: auto !important;
      user-select: none !important;
      touch-action: none !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    `

    this.bar.innerHTML = `
      <div id="atg-thought-bubble" class="atg-thought-bubble">
        <div id="atg-thought-spinner" class="atg-thought-spinner"></div>
        <div id="atg-thought-text" class="atg-thought-text">准备就绪</div>
        <div id="atg-thought-stats" class="atg-thought-stats">输入0 · 输出0 · 会话0 · 上下文≈0</div>
      </div>

      <div id="atg-pet-sprite" class="atg-bluepet atg-bluepet-idle" title="蓝宠">
        <div class="atg-bluepet-shadow"></div>
        <div class="atg-bluepet-head">
          <span class="cloud-outline"></span>
          <span class="cloud lobe-a"></span>
          <span class="cloud lobe-b"></span>
          <span class="cloud lobe-c"></span>
          <span class="cloud lobe-d"></span>
          <span class="cloud lobe-e"></span>
          <span class="cloud lobe-f"></span>
          <div id="atg-bluepet-face" class="atg-bluepet-face">
            <span class="eye left"></span>
            <span class="eye right"></span>
            <span class="mouth"></span>
          </div>
        </div>
        <div class="atg-bluepet-body">
          <span class="chest-mark">&gt;</span>
          <span class="chest-dash"></span>
        </div>
        <span class="arm left"></span>
        <span class="arm right"></span>
        <span class="leg left"></span>
        <span class="leg right"></span>
        <span class="atg-bluepet-fx fx-heart"></span>
        <span class="atg-bluepet-fx fx-star"></span>
        <span class="atg-bluepet-fx fx-z">Z</span>
      </div>

      <div id="atg-pet-status-dot" class="atg-pet-status-dot"></div>
    `

    this.thoughtBubbleEl = this.bar.querySelector('#atg-thought-bubble')
    this.thoughtSpinnerEl = this.bar.querySelector('#atg-thought-spinner')
    this.thoughtTextEl = this.bar.querySelector('#atg-thought-text')
    this.thoughtStatsEl = this.bar.querySelector('#atg-thought-stats')
    this.petSpriteEl = this.bar.querySelector('#atg-pet-sprite')
    this.faceEl = this.bar.querySelector('#atg-bluepet-face')
    this.statusDotEl = this.bar.querySelector('#atg-pet-status-dot')
    this.currentMood = 'idle'

    this.bar.addEventListener('pointerdown', (e) => this.onDragStart(e))
    document.body.appendChild(this.bar)

    this.applyDisplayMode(DEFAULT_DISPLAY_MODE, false)
    this.bindStorageListener()
    void this.restoreDisplayModeAndPosition()
  }

  update(charCount: number, sessionStats: SessionStats, state?: FloatingState) {
    if (!this.bar) return
    this.latestState = state || { question: '', isThinking: false }

    if (this.thoughtTextEl) {
      const question = (state?.question || '').trim()
      const shortQuestion = question.length > 26 ? `${question.slice(0, 26)}...` : question
      if (!shortQuestion) {
        this.thoughtTextEl.textContent = '准备就绪'
      } else {
        const safe = this.escapeHtml(shortQuestion)
        if (sessionStats.currentInputTokens > 0) {
          this.thoughtTextEl.innerHTML = `${safe} · <span class="atg-approx-token">≈${sessionStats.currentInputTokens} tokens</span>`
        } else {
          this.thoughtTextEl.textContent = shortQuestion
        }
      }
    }

    if (this.thoughtStatsEl) {
      this.thoughtStatsEl.textContent = `输入${sessionStats.inputTokens.toLocaleString()} · 输出${sessionStats.outputTokens.toLocaleString()} · 会话${sessionStats.totalTokens.toLocaleString()} · 上下文≈${sessionStats.contextWindowTokens.toLocaleString()}`
    }

    const thinking = !!state?.isThinking
    if (this.thoughtSpinnerEl) {
      this.thoughtSpinnerEl.style.animation = thinking ? 'atg-spinner 0.9s linear infinite' : 'none'
      this.thoughtSpinnerEl.style.display = thinking ? 'block' : 'none'
      this.thoughtSpinnerEl.style.opacity = thinking ? '1' : '0'
    }
    if (this.statusDotEl) {
      this.statusDotEl.classList.toggle('thinking', thinking)
    }
    if (thinking) {
      this.setMood('thinking')
    } else if (this.currentMood === 'thinking') {
      this.setMood('idle')
    }
    this.relayoutCloud()
  }

  hide() {
    if (this.bar) this.bar.style.display = 'none'
  }

  show() {
    if (this.bar) this.bar.style.display = 'block'
  }

  destroy() {
    if (this.bar && this.bar.parentNode) this.bar.parentNode.removeChild(this.bar)
    this.bar = null
    this.thoughtTextEl = null
    this.thoughtStatsEl = null
    this.thoughtBubbleEl = null
    this.thoughtSpinnerEl = null
    this.petSpriteEl = null
    this.faceEl = null
    this.statusDotEl = null
    if (this.mouseMoveBound) {
      window.removeEventListener('mousemove', this.handleMouseMove)
      this.mouseMoveBound = false
    }
    if (this.behaviorTimer) {
      window.clearTimeout(this.behaviorTimer)
      this.behaviorTimer = null
    }
    if (this.storageListenerBound) {
      chrome.storage.onChanged.removeListener(this.handleStorageChanged)
      this.storageListenerBound = false
    }
  }

  private injectStyles() {
    if (document.getElementById('atg-pet-style')) return
    const style = document.createElement('style')
    style.id = 'atg-pet-style'
    style.textContent = `
      @keyframes atg-float {
        0%, 100% { transform: translateY(0) scale(1, 1); }
        50% { transform: translateY(-4px) scale(1.018, .988); }
      }
      @keyframes atg-breathe {
        0%, 100% { transform: translateY(0) scale(1, 1); }
        40% { transform: translateY(-2px) scale(1.025, .985); }
        70% { transform: translateY(1px) scale(.99, 1.012); }
      }
      @keyframes atg-jump {
        0%, 100% { transform: translateY(0) scale(1, 1); }
        28% { transform: translateY(8px) scale(1.1, .82); }
        52% { transform: translateY(-18px) scale(.9, 1.12); }
        78% { transform: translateY(2px) scale(1.04, .95); }
      }
      @keyframes atg-spin-pet {
        0% { transform: rotate(0deg) scale(1); }
        38% { transform: rotate(13deg) scale(1.04); }
        70% { transform: rotate(-10deg) scale(1.02); }
        100% { transform: rotate(0deg) scale(1); }
      }
      @keyframes atg-peek {
        0%, 100% { transform: translateX(0) rotate(0); }
        35% { transform: translateX(-12px) rotate(-5deg); }
        70% { transform: translateX(7px) rotate(4deg); }
      }
      @keyframes atg-spinner {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes atg-blink {
        0%, 88%, 100% { transform: scaleY(1); }
        91%, 94% { transform: scaleY(.16); }
      }
      @keyframes atg-sprout {
        0%, 100% { transform: rotate(-2deg); }
        50% { transform: rotate(5deg); }
      }
      @keyframes atg-heart-pop {
        0%, 78%, 100% { opacity: 0; transform: translate(0, 0) scale(.6); }
        82% { opacity: 1; transform: translate(-8px, -8px) scale(1); }
        92% { opacity: 0; transform: translate(-16px, -22px) scale(1.2); }
      }
      @keyframes atg-star-pop {
        0%, 70%, 100% { opacity: 0; transform: rotate(0deg) scale(.6); }
        78% { opacity: 1; transform: rotate(18deg) scale(1); }
        92% { opacity: 0; transform: rotate(55deg) scale(1.18); }
      }
      @keyframes atg-z-float {
        0%, 70%, 100% { opacity: 0; transform: translateY(0) scale(.65); }
        78% { opacity: 1; transform: translateY(-8px) scale(1); }
        95% { opacity: 0; transform: translateY(-26px) scale(1.1); }
      }

      #ai-token-guard-bar, #ai-token-guard-bar * {
        box-sizing: border-box !important;
      }
      #ai-token-guard-bar {
        cursor: grab !important;
      }
      #ai-token-guard-bar:active {
        cursor: grabbing !important;
      }
      .atg-thought-bubble {
        position: absolute !important;
        left: 50% !important;
        bottom: 118px !important;
        width: max-content !important;
        min-width: 230px !important;
        max-width: 320px !important;
        padding: 11px 38px 12px 16px !important;
        background: rgba(255,255,255,.98) !important;
        border: 1px solid rgba(15,23,42,.08) !important;
        border-radius: 22px !important;
        box-shadow: 0 16px 34px rgba(20,34,71,.18), inset 0 1px 0 rgba(255,255,255,.96) !important;
        color: #111827 !important;
        overflow: hidden !important;
        white-space: normal !important;
        word-break: break-word !important;
        backdrop-filter: blur(12px) !important;
      }
      .atg-thought-text {
        color: #111827 !important;
        font-size: 14px !important;
        line-height: 1.22 !important;
        font-weight: 800 !important;
        letter-spacing: 0 !important;
      }
      .atg-thought-text .atg-approx-token {
        color: #2563eb !important;
        font-weight: 900 !important;
      }
      .atg-thought-stats {
        margin-top: 7px !important;
        color: #64748b !important;
        font-size: 10px !important;
        line-height: 1 !important;
        font-weight: 700 !important;
        white-space: nowrap !important;
      }
      .atg-thought-spinner {
        position: absolute !important;
        right: 12px !important;
        top: 11px !important;
        width: 16px !important;
        height: 16px !important;
        border-radius: 999px !important;
        border: 2px solid rgba(148,163,184,.42) !important;
        border-top-color: #64748b !important;
      }
      .atg-pet-status-dot {
        position: absolute !important;
        right: 12px !important;
        bottom: 86px !important;
        width: 15px !important;
        height: 15px !important;
        border-radius: 999px !important;
        background: #10b981 !important;
        border: 3px solid #ecfeff !important;
        box-shadow: 0 0 0 2px rgba(16,185,129,.16), 0 3px 8px rgba(15,23,42,.18) !important;
      }
      .atg-pet-status-dot.thinking {
        background: #f59e0b !important;
        box-shadow: 0 0 0 2px rgba(245,158,11,.18), 0 3px 8px rgba(15,23,42,.18) !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-bluepet {
        display: none !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-thought-bubble {
        bottom: 0 !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: ${COMPACT_H}px !important;
        padding: 0 42px 0 38px !important;
        display: flex !important;
        align-items: center !important;
        border-radius: 13px !important;
        border-color: rgba(15, 118, 110, .16) !important;
        background: rgba(250, 253, 252, .96) !important;
        box-shadow: 0 10px 28px rgba(15, 23, 42, .12), inset 0 1px 0 rgba(255,255,255,.98) !important;
        backdrop-filter: blur(16px) saturate(1.15) !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-thought-bubble::before {
        content: '' !important;
        position: absolute !important;
        left: 24px !important;
        top: 12px !important;
        width: 1px !important;
        height: 20px !important;
        background: rgba(15, 118, 110, .14) !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-thought-text {
        display: none !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-thought-stats {
        margin: 0 !important;
        color: #334155 !important;
        font-size: 11px !important;
        line-height: 1 !important;
        font-weight: 750 !important;
        letter-spacing: .01em !important;
        font-variant-numeric: tabular-nums !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-thought-spinner {
        right: 13px !important;
        top: 14px !important;
        width: 16px !important;
        height: 16px !important;
        border-color: rgba(15,118,110,.2) !important;
        border-top-color: #0f766e !important;
      }
      #ai-token-guard-bar.atg-mode-compact .atg-pet-status-dot {
        display: block !important;
        left: 10px !important;
        right: auto !important;
        top: 17px !important;
        bottom: auto !important;
        width: 10px !important;
        height: 10px !important;
        border: 2px solid #ecfdf5 !important;
        box-shadow: 0 0 0 2px rgba(16,185,129,.12) !important;
      }
      .atg-bluepet {
        position: absolute !important;
        left: 8px !important;
        bottom: 0 !important;
        width: 96px !important;
        height: 110px !important;
        cursor: grab !important;
        transform-origin: 52% 78% !important;
        animation: atg-float 3.2s ease-in-out infinite !important;
        filter: drop-shadow(0 10px 16px rgba(28,76,191,.24)) !important;
      }
      .atg-bluepet:active {
        cursor: grabbing !important;
      }
      .atg-bluepet-shadow {
        position: absolute !important;
        left: 25px !important;
        bottom: 3px !important;
        width: 46px !important;
        height: 7px !important;
        border-radius: 999px !important;
        background: rgba(31,64,145,.16) !important;
        filter: blur(1px) !important;
      }
      .atg-bluepet-head {
        position: absolute !important;
        left: 0 !important;
        top: 5px !important;
        width: 96px !important;
        height: 76px !important;
        filter: drop-shadow(0 5px 8px rgba(25,83,202,.24)) !important;
      }
      .atg-bluepet-head .cloud-outline {
        position: absolute !important;
        left: 2px !important;
        top: 8px !important;
        width: 92px !important;
        height: 65px !important;
        border-radius: 42px 42px 34px 34px !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      .atg-bluepet-head .cloud {
        position: absolute !important;
        display: block !important;
        border-radius: 999px !important;
        background:
          radial-gradient(circle at 32% 21%, rgba(255,255,255,.82), transparent 19%),
          radial-gradient(circle at 70% 17%, rgba(255,255,255,.48), transparent 22%),
          radial-gradient(circle at 46% 88%, rgba(50,100,230,.42), transparent 30%),
          linear-gradient(180deg, #c9ecff 0%, #91c9ff 44%, #5c8af7 100%) !important;
        box-shadow:
          inset 0 6px 12px rgba(255,255,255,.62),
          inset 0 -10px 15px rgba(21,72,212,.36) !important;
      }
      .lobe-a { left: 4px !important; top: 28px !important; width: 31px !important; height: 36px !important; }
      .lobe-b { left: 14px !important; top: 12px !important; width: 35px !important; height: 42px !important; }
      .lobe-c { left: 37px !important; top: 7px !important; width: 39px !important; height: 45px !important; }
      .lobe-d { left: 63px !important; top: 24px !important; width: 30px !important; height: 37px !important; }
      .lobe-e { left: 12px !important; top: 41px !important; width: 73px !important; height: 31px !important; }
      .lobe-f { left: 2px !important; top: 36px !important; width: 92px !important; height: 34px !important; }
      .atg-bluepet-face {
        position: absolute !important;
        z-index: 5 !important;
        left: 22px !important;
        top: 34px !important;
        width: 52px !important;
        height: 27px !important;
        border-radius: 9px !important;
        background:
          radial-gradient(circle at 50% 0%, rgba(92,145,255,.24), transparent 48%),
          linear-gradient(180deg, #12358d, #071950) !important;
        box-shadow:
          inset 0 2px 4px rgba(255,255,255,.14),
          inset 0 -3px 5px rgba(0,8,40,.26),
          0 0 0 2px #0a287a !important;
      }
      .atg-bluepet-face .eye {
        position: absolute !important;
        top: 9px !important;
        width: 9px !important;
        height: 8px !important;
        border-left: 3px solid #86fbff !important;
        border-top: 3px solid #86fbff !important;
        border-radius: 3px 0 0 0 !important;
        transform: rotate(45deg) !important;
        transform-origin: center !important;
        animation: atg-blink 5.2s ease-in-out infinite !important;
      }
      .atg-bluepet-face .eye.left { left: 12px !important; }
      .atg-bluepet-face .eye.right { right: 12px !important; transform: rotate(45deg) scaleX(-1) !important; }
      .atg-bluepet-face .mouth {
        position: absolute !important;
        left: 23px !important;
        top: 18px !important;
        width: 8px !important;
        height: 4px !important;
        border-bottom: 2px solid #86fbff !important;
        border-radius: 0 0 999px 999px !important;
      }
      .atg-bluepet-body {
        position: absolute !important;
        z-index: 2 !important;
        left: 31px !important;
        top: 68px !important;
        width: 34px !important;
        height: 30px !important;
        border-radius: 15px 15px 13px 13px !important;
        background:
          radial-gradient(circle at 26% 22%, rgba(255,255,255,.5), transparent 18%),
          linear-gradient(180deg, #78b6ff 0%, #406df2 100%) !important;
        box-shadow:
          inset 0 4px 8px rgba(255,255,255,.38),
          inset 0 -8px 10px rgba(21,70,205,.36),
          0 0 0 2px #123caa !important;
      }
      .chest-mark {
        position: absolute !important;
        left: 9px !important;
        top: 8px !important;
        color: #d7fbff !important;
        font: 900 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace !important;
        text-shadow: 0 0 4px rgba(125,248,255,.7) !important;
      }
      .chest-dash {
        position: absolute !important;
        right: 8px !important;
        top: 17px !important;
        width: 8px !important;
        height: 2px !important;
        border-radius: 999px !important;
        background: #d7fbff !important;
        box-shadow: 0 0 4px rgba(125,248,255,.7) !important;
      }
      .atg-bluepet .arm,
      .atg-bluepet .leg {
        position: absolute !important;
        z-index: 1 !important;
        background: linear-gradient(180deg, #70adff, #3b65e4) !important;
        box-shadow: inset 2px 3px 4px rgba(255,255,255,.35), 0 0 0 2px #123caa !important;
      }
      .atg-bluepet .arm {
        top: 75px !important;
        width: 12px !important;
        height: 22px !important;
        border-radius: 999px !important;
      }
      .atg-bluepet .arm.left { left: 22px !important; transform: rotate(16deg); }
      .atg-bluepet .arm.right { right: 22px !important; transform: rotate(-16deg); }
      .atg-bluepet .leg {
        top: 95px !important;
        width: 13px !important;
        height: 11px !important;
        border-radius: 999px !important;
      }
      .atg-bluepet .leg.left { left: 33px !important; }
      .atg-bluepet .leg.right { right: 33px !important; }
      .atg-bluepet-fx {
        position: absolute !important;
        z-index: 9 !important;
        pointer-events: none !important;
        opacity: 0 !important;
        font-weight: 900 !important;
      }
      .fx-heart {
        right: 8px !important;
        top: 24px !important;
        width: 14px !important;
        height: 14px !important;
        transform: rotate(-45deg) !important;
        background: #fb6fa9 !important;
        border-radius: 4px !important;
      }
      .fx-heart:before,
      .fx-heart:after {
        content: '' !important;
        position: absolute !important;
        width: 14px !important;
        height: 14px !important;
        border-radius: 999px !important;
        background: #fb6fa9 !important;
      }
      .fx-heart:before { top: -7px !important; left: 0 !important; }
      .fx-heart:after { top: 0 !important; left: 7px !important; }
      .fx-star {
        right: 0 !important;
        top: 20px !important;
        width: 14px !important;
        height: 14px !important;
        color: #f6c447 !important;
      }
      .fx-star:before {
        content: '✦' !important;
        color: #f6c447 !important;
        font-size: 17px !important;
      }
      .fx-z {
        right: 5px !important;
        top: 12px !important;
        color: #5b8cff !important;
        font-size: 17px !important;
      }
      .atg-bluepet-idle { animation: atg-float 3.2s ease-in-out infinite !important; }
      .atg-bluepet-thinking { animation: atg-breathe 2.4s ease-in-out infinite !important; }
      .atg-bluepet-happy { animation: atg-jump 1.15s ease-out 1, atg-float 3.2s ease-in-out 1.15s infinite !important; }
      .atg-bluepet-jump { animation: atg-jump .95s ease-out 1, atg-float 3.2s ease-in-out .95s infinite !important; }
      .atg-bluepet-spin { animation: atg-spin-pet 1.05s ease-in-out 1, atg-float 3.2s ease-in-out 1.05s infinite !important; }
      .atg-bluepet-peek { animation: atg-peek 1.1s ease-in-out 1, atg-float 3.2s ease-in-out 1.1s infinite !important; }
      .atg-bluepet-sit { transform: translateY(8px) scale(1.06, .9) !important; animation: atg-breathe 3.8s ease-in-out infinite !important; }
      .atg-bluepet-shy .fx-heart { animation: atg-heart-pop 2.1s ease-out 1 !important; }
      .atg-bluepet-happy .fx-star,
      .atg-bluepet-surprised .fx-star { animation: atg-star-pop 1.7s ease-out 1 !important; }
      .atg-bluepet-sleepy .fx-z { animation: atg-z-float 2.4s ease-out infinite !important; }

      .atg-bluepet-sleepy .eye {
        height: 0 !important;
        top: 16px !important;
        border-left: 0 !important;
        border-top: 0 !important;
        border-bottom: 4px solid #7df8ff !important;
        width: 14px !important;
        transform: none !important;
      }
      .atg-bluepet-sleepy .eye.right { transform: none !important; }
      .atg-bluepet-surprised .eye {
        width: 8px !important;
        height: 8px !important;
        border: 3px solid #7df8ff !important;
        border-radius: 999px !important;
        transform: none !important;
      }
      .atg-bluepet-surprised .eye.right { transform: none !important; }
      .atg-bluepet-angry .eye.left { transform: rotate(135deg) !important; }
      .atg-bluepet-angry .eye.right { transform: rotate(-135deg) !important; }
      .atg-bluepet-shy .atg-bluepet-face:after {
        content: '' !important;
        position: absolute !important;
        left: 10px !important;
        top: 21px !important;
        width: 45px !important;
        height: 5px !important;
        background: radial-gradient(circle at 10% 50%, #ff85ba 0 4px, transparent 5px), radial-gradient(circle at 90% 50%, #ff85ba 0 4px, transparent 5px) !important;
        opacity: .85 !important;
      }
    `
    document.head.appendChild(style)
  }

  private bindStorageListener() {
    if (this.storageListenerBound) return
    chrome.storage.onChanged.addListener(this.handleStorageChanged)
    this.storageListenerBound = true
  }

  private handleStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local' || !changes[DISPLAY_MODE_KEY]) return
    const mode = normalizeDisplayMode(changes[DISPLAY_MODE_KEY].newValue)
    this.applyDisplayMode(mode)
  }

  private async restoreDisplayModeAndPosition() {
    try {
      const result = await chrome.storage.local.get(DISPLAY_MODE_KEY)
      if (!this.bar) return
      this.applyDisplayMode(normalizeDisplayMode(result[DISPLAY_MODE_KEY]), false)
      await this.restorePosition()
    } catch {
      // Keep the compact default when storage is unavailable.
    }
  }

  private applyDisplayMode(mode: FloatingDisplayMode, restorePosition = true) {
    if (!this.bar) return
    this.displayMode = mode
    const compact = mode === 'compact'
    const { width, height } = this.getLayoutSize()

    this.bar.classList.toggle('atg-mode-compact', compact)
    this.bar.classList.toggle('atg-mode-pet', !compact)
    this.bar.style.setProperty('width', `${width}px`, 'important')
    this.bar.style.setProperty('height', `${height}px`, 'important')

    if (compact) {
      this.stopBehaviorLoop()
      this.unbindMouseLife()
    } else {
      this.bindMouseLife()
      this.startBehaviorLoop()
    }

    this.applyPosition(this.getDefaultPosition())
    this.relayoutCloud()
    if (restorePosition) void this.restorePosition()
  }

  private getLayoutSize() {
    return this.displayMode === 'compact'
      ? {
          width: Math.min(COMPACT_W, Math.max(220, window.innerWidth - EDGE_MARGIN * 2)),
          height: COMPACT_H,
        }
      : { width: PET_W, height: PET_LAYOUT_H }
  }

  private getDefaultPosition(): Position {
    const { width, height } = this.getLayoutSize()
    return {
      x: Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
      y: Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN),
    }
  }

  private getPositionKey() {
    return this.displayMode === 'compact' ? COMPACT_POS_KEY : PET_POS_KEY
  }

  private onDragStart(e: PointerEvent) {
    if (!this.bar) return
    const rect = this.bar.getBoundingClientRect()
    this.dragOffsetX = e.clientX - rect.left
    this.dragOffsetY = e.clientY - rect.top

    const onMove = (evt: PointerEvent) => {
      if (!this.bar) return
      this.applyPosition({
        x: evt.clientX - this.dragOffsetX,
        y: evt.clientY - this.dragOffsetY,
      })
    }

    const onUp = (evt: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!this.bar) return
      this.applyPosition({
        x: evt.clientX - this.dragOffsetX,
        y: evt.clientY - this.dragOffsetY,
      })
      this.savePosition(this.getCurrentPosition())
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  private applyPosition(pos: Position) {
    if (!this.bar) return
    const { width, height } = this.getLayoutSize()
    const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN)
    const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN)
    const x = Math.max(EDGE_MARGIN, Math.min(pos.x, maxX))
    const y = Math.max(EDGE_MARGIN, Math.min(pos.y, maxY))
    this.bar.style.left = `${Math.round(x)}px`
    this.bar.style.top = `${Math.round(y)}px`
    this.relayoutCloud()
  }

  private async restorePosition() {
    try {
      const positionKey = this.getPositionKey()
      const result = await chrome.storage.local.get(positionKey)
      const pos = result[positionKey] as Position | undefined
      if (!pos) return
      this.applyPosition(pos)
    } catch {
      // ignore storage restore failures
    }
  }

  private relayoutCloud() {
    if (!this.bar || !this.thoughtBubbleEl) return
    if (this.displayMode === 'compact') {
      this.thoughtBubbleEl.style.setProperty('left', '0px', 'important')
      this.thoughtBubbleEl.style.setProperty('transform', 'none', 'important')
      return
    }
    const barRect = this.bar.getBoundingClientRect()
    const bubbleRect = this.thoughtBubbleEl.getBoundingClientRect()
    const margin = 10
    const rawLeft = -bubbleRect.width - 10
    const minLeft = margin - barRect.left
    const maxLeft = window.innerWidth - margin - barRect.left - bubbleRect.width
    const left = Math.max(minLeft, Math.min(rawLeft, maxLeft))
    this.thoughtBubbleEl.style.setProperty('left', `${Math.round(left)}px`, 'important')
    this.thoughtBubbleEl.style.setProperty('transform', 'none', 'important')
  }

  private bindMouseLife() {
    if (this.mouseMoveBound) return
    window.addEventListener('mousemove', this.handleMouseMove)
    this.mouseMoveBound = true
  }

  private unbindMouseLife() {
    if (!this.mouseMoveBound) return
    window.removeEventListener('mousemove', this.handleMouseMove)
    this.mouseMoveBound = false
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.bar || !this.faceEl || this.latestState.isThinking) return
    const rect = this.bar.getBoundingClientRect()
    const cx = rect.left + PET_W / 2
    const cy = rect.top + 100
    const dx = Math.max(-2.5, Math.min(2.5, (e.clientX - cx) / 90))
    const dy = Math.max(-1.5, Math.min(1.5, (e.clientY - cy) / 120))
    this.faceEl.style.transform = `translate(${dx}px, ${dy}px)`
  }

  private startBehaviorLoop() {
    if (this.behaviorTimer) window.clearTimeout(this.behaviorTimer)
    const tick = () => {
      if (!this.latestState.question && !this.latestState.isThinking) {
        const behavior = BLUE_PET_BEHAVIORS[Math.floor(Math.random() * BLUE_PET_BEHAVIORS.length)]
        this.applyBehavior(behavior.text, behavior.mood)
      }
      this.behaviorTimer = window.setTimeout(tick, 4200 + Math.floor(Math.random() * 5200))
    }
    this.behaviorTimer = window.setTimeout(tick, 2200)
  }

  private stopBehaviorLoop() {
    if (!this.behaviorTimer) return
    window.clearTimeout(this.behaviorTimer)
    this.behaviorTimer = null
  }

  private applyBehavior(text: string, mood: PetMood) {
    if (!this.latestState.question && this.thoughtTextEl) this.thoughtTextEl.textContent = text
    this.setMood(mood)
  }

  private setMood(mood: PetMood) {
    if (!this.petSpriteEl) return
    if (this.currentMood === mood) return
    this.currentMood = mood
    const classNames = Array.from(this.petSpriteEl.classList).filter((name) => name !== 'atg-bluepet' && !name.startsWith('atg-bluepet-'))
    this.petSpriteEl.className = [...classNames, 'atg-bluepet', `atg-bluepet-${mood}`].join(' ')
  }

  private savePosition(pos: Position) {
    chrome.storage.local.set({ [this.getPositionKey()]: pos }).catch(() => {
      // ignore storage failures
    })
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private getCurrentPosition(): Position {
    if (!this.bar) return { x: EDGE_MARGIN, y: EDGE_MARGIN }
    const left = parseFloat(this.bar.style.left || '0')
    const top = parseFloat(this.bar.style.top || '0')
    return {
      x: Number.isFinite(left) ? left : EDGE_MARGIN,
      y: Number.isFinite(top) ? top : EDGE_MARGIN,
    }
  }
}
