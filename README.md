# AI Token Guard

> 国内主流大模型网页端 Token 实时计数器 · Chrome Extension  
> Real-time token counter for Chinese AI platforms · Chrome Extension

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/jijiutong/token-guard)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)

---

## 功能 · Features

### 🇨🇳 中文

- **实时输入计数** — 输入框内容实时显示 Token 数（仅展示，不累计）
- **会话累计统计** — 仅在发送后累计输入，回复完成后累计输出
- **上下文窗口估算** — `上下文≈` 基于历史消息 + 当前输入 + 平台基数 + 模板开销估算
- **分平台今日统计** — Popup 中按平台展示输入/输出/总量，以及总览汇总
- **简洁预警设置** — 支持总览阈值与平台阈值预警
- **多会话隔离** — 按真实会话 ID 隔离计数，当天切换历史会话会恢复统计
- **新话题识别** — 真正新开的空白会话显示输入 0 / 输出 0 / 会话 0
- **桌面宠物浮层** — 右下角可拖拽宠物 + 气泡信息展示

### 🇺🇸 English

- **Real-time input counting** — Shows token count while typing (display only, not accumulated)
- **Session accumulation** — Input is counted on submit; output is counted on completed assistant reply
- **Context window estimation** — `Context≈` is estimated from history + current input + base/system overhead
- **Per-platform daily stats** — Popup shows overview plus per-platform input/output/total
- **Simple quota alerts** — Supports global and per-platform token threshold alerts
- **Per-conversation isolation** — Counters are keyed by real conversation IDs and restored when switching history today
- **New-topic detection** — A truly blank new topic starts from input 0 / output 0 / session 0
- **Desktop pet overlay** — Draggable pet and bubble status panel

---

## 支持平台 · Supported Platforms

| 平台 Platform | 网址 URL | 上下文窗口 Context Window |
|---|---|---|
| DeepSeek | chat.deepseek.com | 128K tokens |
| 文心一言 Yiyan | yiyan.baidu.com | 64K tokens |
| 通义千问 Tongyi | tongyi.aliyun.com | 128K tokens |
| 豆包 Doubao | www.doubao.com | 64K tokens |
| Kimi (Moonshot) | platform.moonshot.cn | 2M tokens |

---

## 安装 · Installation

### 从源码构建 · Build from Source

**前置要求 Prerequisites:** Node.js 18+

```bash
# 1. 克隆仓库 Clone the repo
git clone https://github.com/jijiutong/token-guard.git
cd token-guard

# 2. 安装依赖 Install dependencies
npm install

# 3. 构建扩展 Build the extension
npm run build
```

构建产物在 `dist/` 目录。Build output will be in the `dist/` directory.

### 加载到 Chrome · Load in Chrome

1. 打开 `chrome://extensions/` · Open `chrome://extensions/`
2. 开启右上角「开发者模式」· Enable **Developer mode** (top right)
3. 点击「加载已解压的扩展程序」· Click **Load unpacked**
4. 选择项目的 `dist/` 目录 · Select the `dist/` folder
5. 访问任意支持平台，右下角会出现浮动计数栏 · Visit any supported platform — the floating bar appears at the bottom right

---

## 统计口径 · Counting Rules

- **输入（实时）**：输入框当前文本的 token 估算，仅显示，不计入累计。
- **输入（会话）**：仅在发送动作触发时累计。
- **输出（会话）**：仅在识别到助手回复增量时累计。
- **会话**：`会话 = 输入累计 + 输出累计`。
- **上下文≈**：实时估算值，不等于会话，包含历史消息、当前输入和模板开销。
- **历史会话**：同一天内切换历史会话会恢复该会话的输入/输出/会话累计。
- **新开会话**：没有真实会话 ID 的空白新话题从 0 开始。
- **跨天重置**：跨本地自然日后，历史会话的输入/输出/会话累计重新开始；上下文仍按页面内容实时估算。

English summary:

- Live input tokens are display-only until the message is submitted.
- Session input is accumulated on submit; output is accumulated when an assistant reply delta is detected.
- Today’s history conversations restore their own input/output/session totals by conversation ID.
- A blank new topic starts from zero.
- After the local day changes, session totals start fresh while context is still estimated from the visible page.

---

## 界面预览 · UI Preview

```
┌──────────────────────────────────────┐
│  输入 42 · 输出 180 · 会话 222 · 上下文≈ 3,891            │
└──────────────────────────────────────┘
          宠物浮层 · Pet overlay (bottom right, draggable)
```

Popup 页包含「统计」和「设置」两个标签页。  
The popup has two tabs: **Stats** and **Settings**.

---

## 技术栈 · Tech Stack

| 技术 | 用途 |
|---|---|
| Chrome MV3 | 扩展框架 |
| Vue 3 + Pinia | Popup UI |
| [@dqbd/tiktoken](https://github.com/dqbd/tiktoken) | WASM 分词引擎（cl100k_base） |
| Offscreen API | 在 Service Worker 中运行 WASM |
| Vite + CRXJS | 构建工具链 |
| TypeScript | 全项目类型安全 |

---

## 开发 · Development

```bash
npm install
npm run test:context
npm run build
```

常用说明：

- `npm run test:context` 覆盖上下文恢复、输出去重、会话 key、新话题重置等核心逻辑。
- `npm run build` 会先执行 `vue-tsc --noEmit`，再生成 Chrome 扩展产物。
- 构建后的扩展目录是 `dist/`。

### 日志 · Logging

默认只保留基础日志：安装提示、运行时错误、WASM 重试警告、offscreen 初始化失败等。高频调试日志默认关闭。

日志等级通过 `localStorage.ai-token-guard-log-level` 控制：

- `off` 或不设置：只保留基础日志。
- `debug`：输出简要平台调试日志，例如输入/输出抓取路径。
- `trace`：输出完整 `[ATG-TRACE]` 实时追踪日志，仅深度排查时使用。

如需临时排查某个平台，在对应 AI 网页控制台执行：

```js
localStorage.setItem('ai-token-guard-log-level', 'debug')
location.reload()
```

打开完整 trace：

```js
localStorage.setItem('ai-token-guard-log-level', 'trace')
location.reload()
```

关闭调试和 `[ATG-TRACE]`：

```js
localStorage.removeItem('ai-token-guard-log-level')
localStorage.removeItem('ai-token-guard-debug')
location.reload()
```

兼容旧开关：`localStorage.setItem('ai-token-guard-debug', '1')` 只会开启 `debug`，不会再输出 `[ATG-TRACE]`。

---

## 隐私说明 · Privacy

本扩展不收集、不上传任何用户数据。所有 Token 统计数据仅存储在本地 `chrome.storage.local`，不与任何服务器通信。

This extension collects no user data. All token statistics are stored locally in `chrome.storage.local` and never transmitted to any server.

---

## License

MIT
