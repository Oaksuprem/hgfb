import assert from 'node:assert/strict'
import test from 'node:test'
import { mptPresets, nftPresets } from '../src/lib/productPresets.js'

test('a policy certificate is burnable, not transferable, and leaves the URI fixed', () => {
  const policy = nftPresets.policy
  assert.equal(policy.burnable, true)
  assert.equal(policy.transferable, false)
  assert.equal(policy.mutableUri, false)
  assert.equal(policy.transferFee, '0')
  assert.match(policy.note, /not the premium/)
})

test('a property certificate is a transferable bank or trustee NFT, not the government title', () => {
  const property = nftPresets.property
  assert.equal(property.burnable, true)
  assert.equal(property.onlyXrp, false)
  assert.equal(property.transferable, true)
  assert.equal(property.mutableUri, false)
  assert.equal(property.transferFee, '0')
  assert.match(property.note, /bank or trustee/)
  assert.match(property.note, /not the government title/)
  assert.match(property.note, /NFT sell offer/)
  assert.match(property.note, /Destination/)
  assert.match(property.note, /named buyer/)
  assert.match(property.note, /issued-currency/)
})

test('a claim file is burnable, not transferable, and can change its URI later', () => {
  const claim = nftPresets.claim
  assert.equal(claim.burnable, true)
  assert.equal(claim.transferable, false)
  assert.equal(claim.mutableUri, true)
  assert.match(claim.note, /NFTokenModify/)
})

test('cover units require authorization, cannot move, and can be locked', () => {
  const cover = mptPresets.cover
  assert.equal(cover.requireAuth, true)
  assert.equal(cover.immutable.requireAuth, true)
  assert.equal(cover.canTransfer, false)
  assert.equal(cover.canTrade, false)
  assert.equal(cover.canLock, true)
  assert.equal(cover.immutable.metadata, true)
  assert.match(cover.metadata, /peril/)
  assert.match(cover.metadata, /attachment/)
  assert.match(cover.metadata, /exhaustion/)
  assert.match(cover.note, /Confidential/)
})

test('building shares can be transferred and clawed back without freezing that power', () => {
  const shares = mptPresets.building
  assert.equal(shares.requireAuth, true)
  assert.equal(shares.immutable.requireAuth, true)
  assert.equal(shares.canTransfer, true)
  assert.equal(shares.immutable.canTransfer, true)
  assert.equal(shares.canTrade, false)
  assert.equal(shares.canClawback, true)
  assert.equal(shares.immutable.canClawback, false)
  assert.equal(shares.assetScale, '0')
  assert.match(shares.metadata, /titleReference/)
  assert.match(shares.metadata, /valuationCode/)
  assert.match(shares.note, /named buyer/)
  assert.match(shares.note, /Rent is an issued-currency payment/)
})
