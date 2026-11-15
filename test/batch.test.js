import assert from 'node:assert/strict'
import test from 'node:test'
import { Wallet, decode } from 'xrpl'
import { applyTicket, freshOrSaved, selectTickets } from '../src/utils/batch.js'

test('a batch uses the tickets created in this turn while the saved list is still empty', () => {
  const created = [10, 11]
  assert.deepEqual(freshOrSaved(created, []), created)
  assert.deepEqual(freshOrSaved(null, []), [])
})

test('two unused tickets are reused and a shortfall still needs a new batch', () => {
  assert.deepEqual(selectTickets([8, 4], 2), [4, 8])
  assert.equal(selectTickets([4], 2), null)
})

test('a signed ticket order keeps Sequence at zero', () => {
  const wallet = Wallet.generate()
  const prepared = applyTicket({
    TransactionType: 'OfferCreate',
    Account: wallet.address,
    TakerGets: '1000000',
    TakerPays: '1000000',
    Fee: '12',
    LastLedgerSequence: 100,
    Sequence: 6218038,
  }, 42)
  const decoded = decode(wallet.sign(prepared).tx_blob)
  assert.equal(decoded.Sequence, 0)
  assert.equal(decoded.TicketSequence, 42)
})
