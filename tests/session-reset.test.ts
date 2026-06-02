import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasResolvedSessionKey,
  resolveConversationKeyForState,
  shouldCheckEmptyConversationReset,
} from '../src/content/session-reset.ts'

test('checks DeepSeek empty conversations for stale session resets', () => {
  assert.equal(shouldCheckEmptyConversationReset('deepseek'), true)
})

test('checks platforms that can start new topics without route changes', () => {
  assert.equal(shouldCheckEmptyConversationReset('yiyan'), true)
  assert.equal(shouldCheckEmptyConversationReset('doubao'), true)
  assert.equal(shouldCheckEmptyConversationReset('moonshot'), true)
})

test('checks Tongyi empty conversations for stale session resets', () => {
  assert.equal(shouldCheckEmptyConversationReset('tongyi'), true)
})

test('keeps DeepSeek resolved history sessions even while the DOM is empty', () => {
  const key = resolveConversationKeyForState({
    platform: 'deepseek',
    baseKey: 'ds:54b8ee1a-0a33-4e2e-b233-f5b6470e92fc',
    hasConversationMessages: false,
    now: 1000,
    draftConversationNonce: 2,
  })

  assert.equal(key, 'ds:54b8ee1a-0a33-4e2e-b233-f5b6470e92fc')
})

test('starts DeepSeek new pages as draft sessions when no session id exists', () => {
  const key = resolveConversationKeyForState({
    platform: 'deepseek',
    baseKey: 'chat.deepseek.com/',
    hasConversationMessages: false,
    now: 1000,
    draftConversationNonce: 2,
  })

  assert.equal(key, 'deepseek:draft:1000:2')
})

test('detects resolved session keys across providers', () => {
  assert.equal(hasResolvedSessionKey('deepseek', 'ds:abc'), true)
  assert.equal(hasResolvedSessionKey('tongyi', 'tongyi:abc'), true)
  assert.equal(hasResolvedSessionKey('doubao', 'doubao:abc'), true)
  assert.equal(hasResolvedSessionKey('deepseek', 'chat.deepseek.com/'), false)
})

test('keeps Tongyi resolved history sessions even while the DOM is empty', () => {
  const key = resolveConversationKeyForState({
    platform: 'tongyi',
    baseKey: 'tongyi:history-1',
    hasConversationMessages: false,
    now: 1000,
    draftConversationNonce: 2,
  })

  assert.equal(key, 'tongyi:history-1')
})
