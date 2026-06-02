import test from 'node:test'
import assert from 'node:assert/strict'
import {
  stripLeadingUserEcho,
  stripAtgStatsEchoText,
  shouldAllowAwaitingResetNoDelta,
  shouldAttemptOutputSelfHeal,
} from '../src/content/output-cleanup.ts'

test('strips multi-line leading user echo', () => {
  const result = stripLeadingUserEcho(
    '我饿了\n哈哈快去吃点东西',
    ['我饿了']
  )
  assert.equal(result, '哈哈快去吃点东西')
})

test('keeps text when no user echo matches', () => {
  const result = stripLeadingUserEcho(
    '助手回复正文',
    ['我饿了']
  )
  assert.equal(result, '助手回复正文')
})

test('drops atg stats-like echo line', () => {
  const result = stripAtgStatsEchoText('输入3,586 · 输出19,373 · 会话22,959 · 上下文≈18,700')
  assert.equal(result, '')
})

test('awaiting reset requires enough time and stable no-delta polls', () => {
  assert.equal(shouldAllowAwaitingResetNoDelta({
    awaitingMs: 28000,
    stableMs: 6000,
    consecutiveNoDeltaPolls: 4,
  }), true)
  assert.equal(shouldAllowAwaitingResetNoDelta({
    awaitingMs: 26000,
    stableMs: 6000,
    consecutiveNoDeltaPolls: 4,
  }), false)
})

test('output self-heal does not reopen thinking after output was counted', () => {
  assert.equal(shouldAttemptOutputSelfHeal({
    now: 50_000,
    lastSelfHealAttemptAt: 0,
    lastInputCommittedAt: 10_000,
    lastOutputCountedAt: 20_000,
    awaitingAssistantReply: false,
    awaitingStartedAt: 0,
  }), false)
})

test('output self-heal can run when a committed input has no counted output', () => {
  assert.equal(shouldAttemptOutputSelfHeal({
    now: 50_000,
    lastSelfHealAttemptAt: 0,
    lastInputCommittedAt: 10_000,
    lastOutputCountedAt: 0,
    awaitingAssistantReply: false,
    awaitingStartedAt: 0,
  }), true)
})
