# AI Token Guard

[English](README.md) | 简体中文

> 国内主流大模型网页端 Token 实时计数器 · Chrome 扩展

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/jijiutong/ai_token_guard)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)

---

## 功能

- **实时输入计数** — 输入时实时显示 Token 估算值，但不计入累计。
- **会话累计统计** — 发送消息后累计输入，助手回复完成后累计输出。
- **上下文窗口估算** — `上下文≈` 根据历史消息、当前输入、平台基数和模板开销估算。
- **分平台今日统计** — 展示每个平台的输入、输出和总量，并提供总览汇总。
- **额度预警** — 支持设置总览及各平台的 Token 阈值。
- **多会话隔离** — 按真实会话 ID 保存计数，当天重新打开历史会话时恢复统计。
- **新话题识别** — 真正空白的新会话从输入 0 / 输出 0 / 会话 0 开始。
- **双模式页面浮层** — 默认使用简洁状态条，也可切换为可拖拽的桌面宠物。

---

## 支持平台

| 平台 | 网址 | 上下文窗口 |
|---|---|---|
| DeepSeek | chat.deepseek.com | 128K tokens |
| 文心一言 | yiyan.baidu.com | 64K tokens |
| 通义千问 | tongyi.aliyun.com | 128K tokens |
| 豆包 | www.doubao.com | 64K tokens |
| Kimi（Moonshot） | platform.moonshot.cn | 2M tokens |

---

## 安装

### 从源码构建

**前置要求：** Node.js 18+

```bash
git clone https://github.com/jijiutong/ai_token_guard.git
cd ai_token_guard
npm install
npm run build
```

构建产物位于 `dist/` 目录。

### 加载到 Chrome

1. 打开 `chrome://extensions/`。
2. 开启右上角的**开发者模式**。
3. 点击**加载已解压的扩展程序**。
4. 选择项目的 `dist/` 目录。
5. 访问任意支持的平台，浮动计数器会出现在页面右下角。

---

## 统计口径

- **实时输入**仅用于展示，消息发送前不会计入累计。
- **会话输入**仅在检测到发送动作后累计。
- **会话输出**仅在检测到新的助手回复增量后累计。
- **会话**的计算方式为`输入累计 + 输出累计`。
- **上下文≈**是实时估算值，包含历史消息、当前输入和模板开销，不等于会话累计。
- 同一天内重新打开历史会话时，会根据会话 ID 恢复该会话自己的统计。
- 没有真实会话 ID 的空白新话题从零开始。
- 本地自然日变化后，会话累计重新开始；上下文仍根据页面可见内容实时估算。

---

## 界面预览

```text
┌────────────────────────────────────────────┐
│ 输入 42 · 输出 180 · 会话 222 · 上下文≈ 3,891 │
└────────────────────────────────────────────┘
          简洁状态条（默认）/ 桌面宠物
```

Popup 包含**统计**和**设置**两个标签页。可以在**设置 → 页面浮层**中切换简洁状态条和桌面宠物，两种模式会分别保存拖拽位置。

---

## 技术栈

| 技术 | 用途 |
|---|---|
| Chrome Manifest V3 | 扩展框架 |
| Vue 3 + Pinia | Popup 界面 |
| [@dqbd/tiktoken](https://github.com/dqbd/tiktoken) | WASM 分词引擎（`cl100k_base`） |
| Offscreen API | 在 Service Worker 之外运行 WASM |
| Vite + CRXJS | 构建工具链 |
| TypeScript | 类型安全 |

---

## 开发

```bash
npm install
npm run test:context
npm run build
```

- `npm run test:context` 覆盖上下文恢复、输出去重、会话 key、新话题重置和显示模式偏好等核心逻辑。
- `npm run build` 会先运行 `vue-tsc --noEmit`，再在 `dist/` 中生成 Chrome 扩展。

### 日志

默认保留安装、运行时错误、WASM 重试和 offscreen 初始化失败等基础日志，高频调试日志默认关闭。

在支持的 AI 页面中设置 `localStorage.ai-token-guard-log-level` 可控制日志等级：

- 不设置或设为 `off`：只保留基础日志。
- `debug`：输出简要的平台诊断信息。
- `trace`：输出完整的 `[ATG-TRACE]` 诊断信息，仅建议在深度排查时使用。

```js
// 开启简要诊断
localStorage.setItem('ai-token-guard-log-level', 'debug')
location.reload()

// 开启完整 trace
localStorage.setItem('ai-token-guard-log-level', 'trace')
location.reload()

// 关闭诊断
localStorage.removeItem('ai-token-guard-log-level')
localStorage.removeItem('ai-token-guard-debug')
location.reload()
```

兼容旧开关：`localStorage.setItem('ai-token-guard-debug', '1')` 只会开启 `debug`，不会再输出 `[ATG-TRACE]`。

---

## 隐私说明

AI Token Guard 不收集、不上传任何用户数据。所有 Token 统计数据仅存储在本地 `chrome.storage.local` 中，不会传输到任何服务器。

---

## 许可证

MIT
