import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_DISPLAY_MODE, normalizeDisplayMode } from '../src/shared/display-mode.ts'

test('uses the compact bar by default', () => {
  assert.equal(DEFAULT_DISPLAY_MODE, 'compact')
  assert.equal(normalizeDisplayMode(undefined), 'compact')
  assert.equal(normalizeDisplayMode('unknown'), 'compact')
})

test('keeps the explicit pet mode', () => {
  assert.equal(normalizeDisplayMode('pet'), 'pet')
})
