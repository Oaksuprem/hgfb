import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptBlockReason } from '../src/lib/credentials.js'

const issuer = 'rIssuer'
const subject = 'rSubject'

test('accepting from the issuer account is refused when that credential is not waiting there', () => {
  const reason = acceptBlockReason({
    account: issuer,
    issuer,
    credentialType: 'KYC-Verified',
    exists: false,
    accepted: false,
  })
  assert.match(reason, /subject signs the accept/)
})

test('a credential waiting for this account can be accepted', () => {
  assert.equal(acceptBlockReason({
    account: subject,
    issuer,
    credentialType: 'KYC-Verified',
    exists: true,
    accepted: false,
  }), '')
})

test('a missing credential for the subject names the type', () => {
  const reason = acceptBlockReason({
    account: subject,
    issuer,
    credentialType: 'KYC-Verified',
    exists: false,
    accepted: false,
  })
  assert.match(reason, /KYC-Verified/)
})
