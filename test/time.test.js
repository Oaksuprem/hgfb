import assert from 'node:assert/strict'
import test from 'node:test'
import { RIPPLE_EPOCH_OFFSET, rippleExpiration } from '../src/lib/time.js'

test('a date-only expiry lasts through the end of that local day', () => {
  const now = new Date('2026-11-15T19:52:23Z')
  const end = new Date('2026-11-15T23:59:59')
  const ripple = rippleExpiration('2026-11-15', now)
  const midnightUtc = Math.floor(new Date('2026-11-15T00:00:00Z').getTime() / 1000) - RIPPLE_EPOCH_OFFSET

  assert.equal(ripple, Math.floor(end.getTime() / 1000) - RIPPLE_EPOCH_OFFSET)
  assert.equal(midnightUtc, 848016000)
  assert.ok(ripple > midnightUtc)
  assert.ok(ripple + RIPPLE_EPOCH_OFFSET > Math.floor(now.getTime() / 1000))
})

test('an expiry that is already past is refused before submission', () => {
  const now = new Date('2026-11-15T19:52:23Z')
  assert.throws(() => rippleExpiration('2026-11-14', now), /past/)
  assert.equal(rippleExpiration('', now), null)
})
