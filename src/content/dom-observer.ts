import type { PlatformStrategy } from './platform-strategy'

export class DomObserver {
  private observer: MutationObserver | null = null
  private inputElement: HTMLTextAreaElement | HTMLElement | null = null
  private onInputCallback: ((text: string) => void) | null = null
  private onSubmitCallback: ((text: string) => void) | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private strategy: PlatformStrategy
  private observing = false

  constructor(strategy: PlatformStrategy) {
    this.strategy = strategy
  }

  findInputElement(): HTMLTextAreaElement | HTMLElement | null {
    return this.strategy.findInput()
  }

  observeInput(onInput: (text: string) => void, onSubmit?: (text: string) => void): void {
    this.onInputCallback = onInput
    this.onSubmitCallback = onSubmit ?? null
    if (this.observing) return

    const trySetup = (): boolean => {
      this.inputElement = this.findInputElement()
      if (!this.inputElement) {
        return false
      }

      this.bindInputElement(this.inputElement)
      document.removeEventListener('click', this.handleDocumentClick, true)
      document.addEventListener('click', this.handleDocumentClick, true)

      // Set up MutationObserver to handle SPA re-renders
      this.observer?.disconnect()
      this.observer = new MutationObserver(() => {
        if (!this.inputElement || !document.contains(this.inputElement)) {
          this.inputElement = this.findInputElement()
          if (this.inputElement) {
            this.bindInputElement(this.inputElement)
          }
        }
      })
      this.observer.observe(document.body, { childList: true, subtree: true })
      this.observing = true
      return true
    }

    // Start retrying immediately, keep trying every 500ms until found
    const attemptSetup = () => {
      if (trySetup()) {
        // Success - stop retrying
        if (this.retryTimer) {
          clearTimeout(this.retryTimer)
          this.retryTimer = null
        }
      } else {
        // Not found yet, retry
        this.retryTimer = setTimeout(attemptSetup, 500)
      }
    }

    attemptSetup()
  }

  private handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement | HTMLElement
    const text = this.strategy.readInput(target)
    if (this.onInputCallback) {
      this.onInputCallback(text)
    }
  }

  private handleKeydown = (event: Event) => {
    const e = event as KeyboardEvent
    if (e.isComposing || e.key !== 'Enter' || e.shiftKey) return
    this.emitSubmit()
  }

  private handleDocumentClick = (e: MouseEvent) => {
    const target = e.target as Element | null
    const sendButton = this.strategy.findSendButton()
    const button = target?.closest('button, [role="button"], [aria-label*="发送"], [aria-label*="Send"], [data-testid*="send"]')
    if (sendButton && target && (sendButton === target || sendButton.contains(target as Node))) {
      this.emitSubmit()
      return
    }
    if (!button || !this.isLikelySendButton(button)) return
    this.emitSubmit()
  }

  private isLikelySendButton(el: Element): boolean {
    const text = el.textContent?.trim() || ''
    const aria = el.getAttribute('aria-label') || ''
    const title = el.getAttribute('title') || ''
    const testId = el.getAttribute('data-testid') || ''
    const label = `${text} ${aria} ${title} ${testId}`.toLowerCase()
    if (/发送|send|submit|arrow-up|paper-airplane/.test(label)) return true

    const currentText = this.getCurrentInputText()
    if (!currentText.trim()) return false
    const inputRect = this.inputElement?.getBoundingClientRect()
    const buttonRect = el.getBoundingClientRect()
    if (!inputRect) return false
    const nearInput = (
      Math.abs(buttonRect.bottom - inputRect.bottom) < 120 &&
      Math.abs(buttonRect.right - inputRect.right) < 180
    )
    return nearInput && el.querySelector('svg') !== null
  }

  private emitSubmit() {
    if (!this.onSubmitCallback || !this.inputElement) return
    const text = this.strategy.readInput(this.inputElement)
    if (text.trim()) this.onSubmitCallback(text)
  }

  getCurrentInputText(): string {
    this.refreshInputElement()
    return this.inputElement ? this.strategy.readInput(this.inputElement) : ''
  }

  private refreshInputElement() {
    const current = this.findInputElement()
    if (!current || current === this.inputElement) return
    this.inputElement?.removeEventListener('input', this.handleInput)
    this.inputElement?.removeEventListener('keydown', this.handleKeydown)
    this.inputElement = current
    this.bindInputElement(current)
  }

  private bindInputElement(el: HTMLTextAreaElement | HTMLElement) {
    el.removeEventListener('input', this.handleInput)
    el.removeEventListener('keydown', this.handleKeydown)
    el.addEventListener('input', this.handleInput)
    el.addEventListener('keydown', this.handleKeydown)
  }

  disconnect() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.observer?.disconnect()
    this.inputElement?.removeEventListener('input', this.handleInput)
    this.inputElement?.removeEventListener('keydown', this.handleKeydown)
    document.removeEventListener('click', this.handleDocumentClick, true)
    this.observer = null
    this.inputElement = null
    this.observing = false
  }
}
