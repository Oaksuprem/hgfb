import assert from 'node:assert/strict'
import test from 'node:test'
import * as xrpl from 'xrpl'
import { instantOpenAllowed } from '../src/lib/account.js'
import { displayCurrency, formatAmount, holdingsFromLines } from '../src/lib/holdings.js'
import { amountOf, trustLimit } from '../src/lib/amounts.js'
import { normalizeAccountTx } from '../src/lib/tx.js'

const RLUSD = '524C555344000000000000000000000000000000'
const holder = 'rHolderAccount111111111111111'
const issuer = 'rIssuerAccount111111111111111'

test('instant open is refused on mainnet and allowed on test rails', () => {
  assert.equal(instantOpenAllowed('mainnet'), false)
  assert.equal(instantOpenAllowed('devnet'), true)
  assert.equal(instantOpenAllowed('testnet'), true)
})

test('XRP and issued payments build amounts that still sign', () => {
  const payer = xrpl.Wallet.generate()
  const dest = xrpl.Wallet.generate()
  const xrpAmount = amountOf(xrpl, { code: 'XRP' }, '2')
  assert.equal(xrpAmount, '2000000')

  const xrpSigned = payer.sign({
    TransactionType: 'Payment',
    Account: payer.address,
    Destination: dest.address,
    Amount: xrpAmount,
    Fee: '12',
    Sequence: 1,
  })
  assert.equal(typeof xrpSigned.tx_blob, 'string')
  assert.match(xrpSigned.hash, /^[A-F0-9]{64}$/)

  const issuedAmount = amountOf(xrpl, { code: 'ETH', issuer: dest.address }, '1.25')
  assert.deepEqual(issuedAmount, { currency: 'ETH', issuer: dest.address, value: '1.25' })
  const issuedSigned = payer.sign({
    TransactionType: 'Payment',
    Account: payer.address,
    Destination: dest.address,
    Amount: issuedAmount,
    Fee: '12',
    Sequence: 2,
  })
  assert.match(issuedSigned.hash, /^[A-F0-9]{64}$/)
})

test('a trust line builds a signable TrustSet', () => {
  const holderW = xrpl.Wallet.generate()
  const issuerW = xrpl.Wallet.generate()
  const limit = trustLimit({ code: 'USD', issuer: issuerW.address }, '1000')
  assert.deepEqual(limit, { currency: 'USD', issuer: issuerW.address, value: '1000' })
  const signed = holderW.sign({
    TransactionType: 'TrustSet',
    Account: holderW.address,
    LimitAmount: limit,
    Fee: '12',
    Sequence: 1,
  })
  assert.match(signed.hash, /^[A-F0-9]{64}$/)
})

test('held lines keep currency, issuer, and balance', () => {
  const lines = holdingsFromLines([
    { currency: 'ETH', account: issuer, balance: '3.5', limit: '1000' },
    { currency: RLUSD, account: issuer, balance: '0', limit: '50' },
    { balance: '1' },
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines[0].currency, 'ETH')
  assert.equal(lines[0].balance, '3.5')
  assert.equal(lines[0].issuer, issuer)
  assert.equal(lines[1].currency, 'RLUSD')
  assert.equal(lines[1].balance, '0')
  assert.equal(displayCurrency(RLUSD), 'RLUSD')
})

test('activity names issued assets and their balance changes', () => {
  const issued = normalizeAccountTx({
    hash: 'ABC',
    tx_json: {
      TransactionType: 'Payment',
      Account: issuer,
      Destination: holder,
      Amount: { currency: 'ETH', issuer, value: '2' },
      date: 700000000,
    },
    meta: {
      TransactionResult: 'tesSUCCESS',
      delivered_amount: { currency: RLUSD, issuer, value: '2' },
      AffectedNodes: [{
        ModifiedNode: {
          LedgerEntryType: 'RippleState',
          LedgerIndex: '1',
          PreviousFields: { Balance: { currency: 'ETH', issuer, value: '1' } },
          FinalFields: {
            Balance: { currency: 'ETH', issuer, value: '3' },
            LowLimit: { currency: 'ETH', issuer: holder, value: '1000' },
            HighLimit: { currency: 'ETH', issuer, value: '0' },
          },
        },
      }],
    },
    validated: true,
  }, holder)

  assert.equal(issued.status, 'success')
  assert.match(issued.amount, /ETH/)
  assert.match(issued.amount, /2/)

  const trust = normalizeAccountTx({
    hash: 'DEF',
    tx_json: {
      TransactionType: 'TrustSet',
      Account: holder,
      LimitAmount: { currency: RLUSD, issuer, value: '1000' },
    },
    meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] },
    validated: true,
  }, holder)
  assert.equal(trust.label, 'Trust line')
  assert.equal(trust.amount, formatAmount({ currency: RLUSD, issuer, value: '1000' }).replace(/^/, 'Limit '))
  assert.match(trust.amount, /RLUSD/)
  assert.match(trust.amount, /1000/)
})
