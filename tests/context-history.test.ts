import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeContextHistorySample,
  restoreContextHistoryFromWindow,
  type ContextHistoryState,
} from '../src/content/context-history.ts'

const emptyState: ContextHistoryState = {
  tokens: 0,
  turns: 0,
  fingerprint: '',
}

test('accepts the first context sample', () => {
  const result = mergeContextHistorySample(emptyState, {
    tokens: 1000,
    turns: 4,
    fingerprint: 'fp-a',
  })

  assert.equal(result.decision, 'accepted')
  assert.deepEqual(result.state, {
    tokens: 1000,
    turns: 4,
    fingerprint: 'fp-a',
  })
})

test('accepts a larger sample in the same conversation', () => {
  const result = mergeContextHistorySample({
    tokens: 1000,
    turns: 4,
    fingerprint: 'fp-a',
  }, {
    tokens: 1300,
    turns: 5,
    fingerprint: 'fp-b',
  })

  assert.equal(result.decision, 'accepted')
  assert.deepEqual(result.state, {
    tokens: 1300,
    turns: 5,
    fingerprint: 'fp-b',
  })
})

test('keeps the trusted sample when the DOM sample shrinks', () => {
  const trusted = {
    tokens: 3000,
    turns: 8,
    fingerprint: 'fp-full',
  }
  const result = mergeContextHistorySample(trusted, {
    tokens: 500,
    turns: 2,
    fingerprint: 'fp-partial',
  })

  assert.equal(result.decision, 'ignored_shrink')
  assert.deepEqual(result.state, trusted)
})

test('keeps the larger turn count when tokens are unchanged', () => {
  const result = mergeContextHistorySample({
    tokens: 3000,
    turns: 8,
    fingerprint: 'fp-full',
  }, {
    tokens: 3000,
    turns: 3,
    fingerprint: 'fp-rechunked',
  })

  assert.equal(result.decision, 'accepted')
  assert.deepEqual(result.state, {
    tokens: 3000,
    turns: 8,
    fingerprint: 'fp-rechunked',
  })
})

test('allows a reset to accept a smaller fresh sample', () => {
  const result = mergeContextHistorySample(emptyState, {
    tokens: 130,
    turns: 0,
    fingerprint: 'fp-new',
  })

  assert.equal(result.decision, 'accepted')
  assert.deepEqual(result.state, {
    tokens: 130,
    turns: 0,
    fingerprint: 'fp-new',
  })
})

test('ignores a temporary shrink and later accepts growth', () => {
  const trusted = {
    tokens: 3000,
    turns: 8,
    fingerprint: 'fp-full',
  }
  const shrink = mergeContextHistorySample(trusted, {
    tokens: 2800,
    turns: 7,
    fingerprint: 'fp-short',
  })
  const growth = mergeContextHistorySample(shrink.state, {
    tokens: 3100,
    turns: 9,
    fingerprint: 'fp-later',
  })

  assert.equal(shrink.decision, 'ignored_shrink')
  assert.equal(growth.decision, 'accepted')
  assert.deepEqual(growth.state, {
    tokens: 3100,
    turns: 9,
    fingerprint: 'fp-later',
  })
})

test('restores trusted history from a larger stored context window', () => {
  const result = restoreContextHistoryFromWindow({
    tokens: 500,
    turns: 2,
    fingerprint: 'fp-partial',
  }, 3120, 120)

  assert.deepEqual(result, {
    tokens: 3000,
    turns: 0,
    fingerprint: 'fp-partial',
  })
})

test('does not shrink trusted history from a smaller stored context window', () => {
  const trusted = {
    tokens: 3000,
    turns: 8,
    fingerprint: 'fp-full',
  }
  const result = restoreContextHistoryFromWindow(trusted, 620, 120)

  assert.deepEqual(result, trusted)
})
