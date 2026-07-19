# AI Token Guard

English | [简体中文](README.zh-CN.md)

> A real-time token counter for major Chinese AI platforms · Chrome Extension

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/jijiutong/ai_token_guard)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)

---

## Features

- **Real-time input counting** — Shows the estimated token count while you type without adding it to the total.
- **Session accumulation** — Counts input after submission and output after an assistant response is completed.
- **Context window estimation** — Estimates `Context≈` from message history, current input, platform baseline, and template overhead.
- **Per-platform daily statistics** — Shows input, output, and total usage for each platform, plus an overall summary.
- **Quota alerts** — Supports global and per-platform token thresholds.
- **Conversation isolation** — Stores counts by real conversation ID and restores today's totals when you revisit a conversation.
- **New-topic detection** — Starts a truly blank conversation at input 0 / output 0 / session 0.
- **Two overlay modes** — Uses a compact status bar by default, with an optional draggable desktop pet.

---

## Supported Platforms

| Platform | URL | Context Window |
|---|---|---|
| DeepSeek | chat.deepseek.com | 128K tokens |
| Yiyan | yiyan.baidu.com | 64K tokens |
| Tongyi Qianwen | tongyi.aliyun.com | 128K tokens |
| Doubao | www.doubao.com | 64K tokens |
| Kimi (Moonshot) | platform.moonshot.cn | 2M tokens |

---

## Installation

### Build from Source

**Prerequisite:** Node.js 18+

```bash
git clone https://github.com/jijiutong/ai_token_guard.git
cd ai_token_guard
npm install
npm run build
```

The build output is created in `dist/`.

### Load in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select the project's `dist/` directory.
5. Open any supported platform. The floating counter appears in the bottom-right corner.

---

## Counting Rules

- **Live input** is display-only until the message is submitted.
- **Session input** is accumulated when a submit action is detected.
- **Session output** is accumulated when a new assistant response delta is detected.
- **Session** is calculated as `accumulated input + accumulated output`.
- **Context≈** is a live estimate that includes message history, current input, and template overhead. It is not the same as the session total.
- Conversations visited on the same day restore their own totals using the conversation ID.
- A blank new topic without a real conversation ID starts from zero.
- Session totals reset after the local calendar day changes, while context continues to be estimated from visible page content.

---

## UI Preview

```text
┌─────────────────────────────────────────────────────┐
│ Input 42 · Output 180 · Session 222 · Context≈ 3,891 │
└─────────────────────────────────────────────────────┘
       Compact status bar (default) / Desktop pet
```

The popup contains **Stats** and **Settings** tabs. Choose the compact status bar or desktop pet under **Settings → Page overlay**. Each mode keeps its own dragged position.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Chrome Manifest V3 | Extension framework |
| Vue 3 + Pinia | Popup UI |
| [@dqbd/tiktoken](https://github.com/dqbd/tiktoken) | WASM tokenizer (`cl100k_base`) |
| Offscreen API | Runs WASM outside the service worker |
| Vite + CRXJS | Build toolchain |
| TypeScript | Type safety |

---

## Development

```bash
npm install
npm run test:context
npm run build
```

- `npm run test:context` covers context restoration, output deduplication, conversation keys, new-topic resets, and display-mode preferences.
- `npm run build` runs `vue-tsc --noEmit` before generating the Chrome extension in `dist/`.

### Logging

Basic installation, runtime error, WASM retry, and offscreen initialization logs remain enabled by default. High-frequency debug logs are disabled.

Set `localStorage.ai-token-guard-log-level` on a supported AI page to control logging:

- Unset or `off`: basic logs only.
- `debug`: concise platform diagnostics.
- `trace`: full `[ATG-TRACE]` diagnostics for deep troubleshooting.

```js
// Enable concise diagnostics
localStorage.setItem('ai-token-guard-log-level', 'debug')
location.reload()

// Enable full trace output
localStorage.setItem('ai-token-guard-log-level', 'trace')
location.reload()

// Disable diagnostics
localStorage.removeItem('ai-token-guard-log-level')
localStorage.removeItem('ai-token-guard-debug')
location.reload()
```

The legacy `localStorage.setItem('ai-token-guard-debug', '1')` switch enables `debug` only and no longer enables `[ATG-TRACE]` output.

---

## Privacy

AI Token Guard does not collect or upload user data. All token statistics are stored locally in `chrome.storage.local` and are never transmitted to a server.

---

## License

MIT
