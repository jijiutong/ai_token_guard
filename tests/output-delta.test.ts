import assert from 'node:assert/strict'
import test from 'node:test'
import { createOutputSignature, getAppendOnlyDelta, getTailWindowDelta } from '../src/content/output-delta.ts'

test('returns full output for first assistant reply', () => {
  assert.equal(getAppendOnlyDelta('', 'hello world'), 'hello world')
})

test('returns only appended assistant text', () => {
  assert.equal(getAppendOnlyDelta('hello', 'hello world'), 'world')
})

test('ignores repeated fallback output', () => {
  assert.equal(getAppendOnlyDelta('hello world', 'hello world'), '')
})

test('ignores layout rewrites that lose the trusted baseline', () => {
  assert.equal(getAppendOnlyDelta('previous assistant answer', 'unrelated rewritten block'), '')
})

test('ignores trivial shared-prefix rewrites', () => {
  assert.equal(getAppendOnlyDelta('回答一段旧内容', '回答完全不同的新块'), '')
})

test('deduplicates the same output across capture paths', () => {
  const first = createOutputSignature('deepseek:abc', ' hello   world ')
  const second = createOutputSignature('deepseek:abc', 'hello world')

  assert.equal(first, second)
})

test('scopes output signatures by conversation', () => {
  const first = createOutputSignature('deepseek:abc', 'hello world')
  const second = createOutputSignature('deepseek:def', 'hello world')

  assert.notEqual(first, second)
})

test('extracts tail-window delta for wrapper rewrites', () => {
  const baseline = '前面很多旧内容 ... 锚点片段AABBCCDD'
  const current = '系统重排后前面变化 ... 锚点片段AABBCCDD 新回复追加在这里'
  assert.equal(getTailWindowDelta(baseline, current), '新回复追加在这里')
})
