import assert from 'node:assert/strict'
import test from 'node:test'
import { getLocalDayKey } from '../src/shared/day-key.ts'

test('formats local day key as yyyy-mm-dd', () => {
  const key = getLocalDayKey(new Date(2026, 5, 2, 9, 7, 52).getTime())
  assert.equal(key, '2026-06-02')
})

test('changes when local date crosses midnight', () => {
  const before = getLocalDayKey(new Date(2026, 5, 2, 23, 59, 59).getTime())
  const after = getLocalDayKey(new Date(2026, 5, 3, 0, 0, 1).getTime())
  assert.notEqual(before, after)
  assert.equal(before, '2026-06-02')
  assert.equal(after, '2026-06-03')
})
