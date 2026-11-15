import assert from 'node:assert/strict'
import test from 'node:test'
import * as xrpl from 'xrpl'
import {
  buildPayment,
  ledgerErrorMessage,
  paymentResultMessage,
  prepareIssuedPayment,
  xrpPayment,
} from '../src/lib/payments.js'

const TWO_PERCENT = 1_020_000_000
const sender = 'rSender'
const issuer = 'rIssuer'
const destination = 'rDest'

function line(account, balance, limit = '1000000000') {
  return { account, currency: 'NOM', balance: String(balance), limit: String(limit), no_ripple: false, no_ripple_peer: false }
}

function demoClient({ transferRate = TWO_PERCENT, senderLines = [line(issuer, '4000')], destLines = [line(issuer, '150000')], fail } = {}) {
  return {
    async request(req) {
      if (fail) throw new Error(fail)
      if (req.command === 'account_info') {
        return { result: { account_data: { TransferRate: transferRate, Flags: 0 } } }
      }
      if (req.command === 'account_lines') {
        const lines = req.account === sender ? senderLines : destLines
        return { result: { lines } }
      }
      if (req.command === 'ripple_path_find') {
        const value = Number(req.destination_amount.value)
        const affordable = 4000 * 1_000_000_000 / transferRate
        if (!(value > 0) || value > affordable + 1e-8) return { result: { alternatives: [] } }
        return {
          result: {
            alternatives: [{
              source_amount: { currency: 'NOM', issuer, value: String(value * transferRate / 1_000_000_000) },
            }],
          },
        }
      }
      throw new Error('unexpected ' + req.command)
    },
  }
}

test('a demo payment of 500 from a 4000 balance delivers 500 and reserves the 2% fee', async () => {
  const prepared = await prepareIssuedPayment(demoClient(), {
    sender,
    destination,
    amount: '500',
    currency: 'NOM',
    issuer,
  })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.amount, '500')
  assert.equal(prepared.sendMax, '510')
  assert.equal(prepared.note, '')

  const payer = xrpl.Wallet.generate()
  const dest = xrpl.Wallet.generate()
  const signed = payer.sign({
    ...buildPayment({
      account: payer.address,
      destination: dest.address,
      amount: { currency: 'NOM', issuer: xrpl.Wallet.generate().address, value: prepared.amount },
      sendMax: prepared.sendMax,
    }),
    Fee: '12',
    Sequence: 1,
  })
  assert.match(signed.hash, /^[A-F0-9]{64}$/)
})

test('an issuer distribution does not add SendMax, and a missing trust line is not submitted', async () => {
  const issued = await prepareIssuedPayment(demoClient(), {
    sender: issuer,
    destination,
    amount: '500',
    currency: 'NOM',
    issuer,
  })
  assert.equal(issued.ok, true)
  assert.equal(issued.amount, '500')
  assert.equal(issued.sendMax, null)

  const missing = await prepareIssuedPayment(demoClient({ destLines: [] }), {
    sender,
    destination,
    amount: '500',
    currency: 'NOM',
    issuer,
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'tecPATH_DRY')

  const absent = await prepareIssuedPayment(demoClient({ fail: 'actNotFound' }), {
    sender,
    destination,
    amount: '500',
    currency: 'NOM',
    issuer,
  })
  assert.equal(absent.ok, false)
  assert.match(absent.message, /trust line/)
})

test('XRP payments stay direct and result codes stay readable in a demo', () => {
  const payer = xrpl.Wallet.generate()
  const dest = xrpl.Wallet.generate()
  const tx = xrpPayment({
    xrpl,
    account: payer.address,
    destination: dest.address,
    amount: '2',
  })
  assert.equal(tx.Amount, '2000000')
  assert.equal(tx.SendMax, undefined)
  const signed = payer.sign({ ...tx, Fee: '12', Sequence: 1 })
  assert.match(signed.hash, /^[A-F0-9]{64}$/)

  assert.match(paymentResultMessage('tecPATH_PARTIAL'), /transfer fee/)
  assert.match(paymentResultMessage('tecPATH_DRY'), /trust line/)
  assert.match(ledgerErrorMessage(new Error('actNotFound')), /trust line/)
})
