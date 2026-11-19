import assert from 'node:assert/strict'
import test from 'node:test'
import * as xrpl from 'xrpl'
import {
  LSF_DEFAULT_RIPPLE,
  TF_CLEAR_NO_RIPPLE,
  buildClearNoRipple,
  clearingAmount,
  maxDeliverable,
  paymentSendMax,
  planFromLines,
  planIssuedSend,
  keepDefaultRipple,
  rippleRepairNote,
  rippleRepairTransactions,
  sourceRequired,
} from '../src/lib/pathfix.js'

const holder = xrpl.Wallet.generate()
const issuer = xrpl.Wallet.generate()
const ONE_PERCENT = 1_010_000_000

test('a transfer fee raises the source amount and lowers what a balance can deliver', () => {
  assert.equal(sourceRequired('100', 0), '100')
  assert.equal(sourceRequired('100', ONE_PERCENT), '101')
  assert.equal(maxDeliverable('101', ONE_PERCENT), '100')
  assert.equal(maxDeliverable('0', ONE_PERCENT), '0')
})

test('500 from a 4000 balance still delivers 500 when SendMax covers the 2% fee', () => {
  const twoPercent = 1_020_000_000
  const plan = planIssuedSend({
    amount: '500',
    senderIsIssuer: false,
    senderBalance: '4000',
    destHasLine: true,
    destRoom: 1_000_000_000,
    transferRate: twoPercent,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.amount, '500')
  assert.equal(plan.note, '')
  assert.equal(paymentSendMax({
    amount: '500',
    transferRate: twoPercent,
    senderIsIssuer: false,
    balance: '4000',
  }), '510')
  assert.equal(paymentSendMax({
    amount: '500',
    transferRate: 0,
    senderIsIssuer: false,
    balance: '4000',
  }), null)
  assert.equal(paymentSendMax({
    amount: '500',
    transferRate: twoPercent,
    senderIsIssuer: true,
    balance: '4000',
  }), null)
})

test('a 2% transfer fee keeps the delivered amount inside the sender balance', () => {
  const twoPercent = 1_020_000_000
  const plan = planIssuedSend({
    amount: '15000',
    senderIsIssuer: false,
    senderBalance: '15000',
    destHasLine: true,
    destRoom: 1_000_000_000,
    transferRate: twoPercent,
  })
  assert.equal(plan.ok, true)
  assert.ok(Number(plan.amount) < 15000)
  assert.ok(Number(plan.amount) * twoPercent / 1_000_000_000 <= 15000)
  assert.match(plan.note, /Sending /)
})

test('path finding lowers an amount the ledger cannot deliver in full', async () => {
  const client = {
    async request(req) {
      const value = Number(req.destination_amount.value)
      return { result: { alternatives: value > 0 && value <= 30 ? [{}] : [] } }
    },
  }
  const fitted = await clearingAmount(client, {
    source: 'rSource',
    destination: 'rDest',
    currency: 'NOM',
    issuer: 'rIssuer',
    amount: '80',
  })
  assert.equal(fitted.checked, true)
  assert.ok(Number(fitted.amount) > 0)
  assert.ok(Number(fitted.amount) <= 30)

  const open = await clearingAmount(client, {
    source: 'rSource',
    destination: 'rDest',
    currency: 'NOM',
    issuer: 'rIssuer',
    amount: '25',
  })
  assert.equal(open.amount, '25')
})

test('a full holder payment stays unchanged when the path can clear', () => {
  const plan = planIssuedSend({
    amount: '25',
    senderIsIssuer: false,
    senderBalance: '40',
    destHasLine: true,
    destRoom: 100,
    transferRate: 0,
    issuerNoRipple: false,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.amount, '25')
  assert.equal(plan.note, '')
})

test('tecPATH_DRY stays unsent when rippling is off or the receiver has no line', () => {
  const dry = planIssuedSend({
    amount: '10',
    senderIsIssuer: false,
    senderBalance: '10',
    destHasLine: true,
    destRoom: 100,
    issuerNoRipple: true,
  })
  assert.equal(dry.ok, false)
  assert.equal(dry.code, 'tecPATH_DRY')

  const missing = planIssuedSend({
    amount: '10',
    senderIsIssuer: true,
    destHasLine: false,
    destRoom: 0,
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'tecPATH_DRY')
})

test('tecPATH_PARTIAL fits the amount to the room that can actually clear', () => {
  const fee = planIssuedSend({
    amount: '100',
    senderIsIssuer: false,
    senderBalance: '101',
    destHasLine: true,
    destRoom: 1000,
    transferRate: ONE_PERCENT,
  })
  assert.equal(fee.ok, true)
  assert.equal(fee.amount, '100')
  assert.equal(fee.note, '')

  const room = planIssuedSend({
    amount: '80',
    senderIsIssuer: false,
    senderBalance: '200',
    destHasLine: true,
    destRoom: 30,
  })
  assert.equal(room.ok, true)
  assert.equal(room.amount, '30')
  assert.match(room.note, /Sending 30/)

  const empty = planIssuedSend({
    amount: '5',
    senderIsIssuer: true,
    destHasLine: true,
    destRoom: 0,
  })
  assert.equal(empty.ok, false)
  assert.equal(empty.code, 'tecPATH_PARTIAL')
})

test('a line snapshot plans the same payment the page will send', () => {
  const open = planFromLines({
    amount: '25',
    senderIsIssuer: false,
    senderLine: { currency: 'ETH', balance: '40', limit: '100', no_ripple_peer: false },
    destLine: { currency: 'ETH', balance: '0', limit: '100', no_ripple_peer: false },
    transferRate: 0,
  })
  assert.equal(open.ok, true)
  assert.equal(open.amount, '25')

  const blocked = planFromLines({
    amount: '25',
    senderIsIssuer: false,
    senderLine: { currency: 'ETH', balance: '40', limit: '100', no_ripple_peer: true },
    destLine: { currency: 'ETH', balance: '0', limit: '100' },
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.code, 'tecPATH_DRY')
})

test('issuer settings keep default rippling on and cannot clear it', () => {
  const kept = keepDefaultRipple(['asfRequireAuth'], ['asfDefaultRipple', 'asfGlobalFreeze'])
  assert.deepEqual(kept.setFlags, ['asfDefaultRipple', 'asfRequireAuth'])
  assert.deepEqual(kept.clearFlags, ['asfGlobalFreeze'])
  const already = keepDefaultRipple(['asfDefaultRipple'], [])
  assert.deepEqual(already.setFlags, ['asfDefaultRipple'])
})

test('existing-line repair sets default rippling only when it is off, then clears No Ripple', () => {
  const issuerAddress = issuer.address
  const alreadyOn = rippleRepairTransactions({
    account: issuerAddress,
    flags: LSF_DEFAULT_RIPPLE,
    lines: [{ currency: 'USD', account: holder.address, limit: '0', no_ripple: false }],
  })
  assert.deepEqual(alreadyOn, [])
  assert.match(rippleRepairNote(0), /already on/)

  const repairs = rippleRepairTransactions({
    account: issuerAddress,
    flags: 0,
    lines: [
      { currency: 'USD', account: holder.address, limit: '0', no_ripple: true },
      { currency: 'EUR', account: holder.address, limit: '5', no_ripple: false },
    ],
  })
  assert.equal(repairs.length, 2)
  assert.equal(repairs[0].SetFlag, 8)
  assert.equal(repairs[1].Flags, TF_CLEAR_NO_RIPPLE)
  assert.equal(repairs[1].LimitAmount.value, '0')
  assert.match(rippleRepairNote(1), /1 existing line\./)
})

test('clearing No Ripple keeps the existing limit and still signs', () => {
  const tx = buildClearNoRipple({
    account: issuer.address,
    currency: 'USD',
    counterparty: holder.address,
    limit: '0',
  })
  assert.equal(tx.Flags, TF_CLEAR_NO_RIPPLE)
  assert.deepEqual(tx.LimitAmount, { currency: 'USD', issuer: holder.address, value: '0' })
  const signed = issuer.sign({ ...tx, Fee: '12', Sequence: 1 })
  assert.match(signed.hash, /^[A-F0-9]{64}$/)
})
