/**
 * DexService — pure builders for order-book offers.
 */
import { rippleExpiration } from '../lib/time.js'
import { offerCreateFlags } from '../lib/txFlags.js'

export function buildCreateOffer({ account, takerGets, takerPays, expiration, offerSequence, domainID, flags = {} }) {
  const f = offerCreateFlags(flags)
  const tx = { TransactionType: 'OfferCreate', Account: account, TakerGets: takerGets, TakerPays: takerPays }
  if (f) tx.Flags = f
  if (expiration)    tx.Expiration    = rippleExpiration(expiration)
  if (offerSequence) tx.OfferSequence = offerSequence
  if (domainID)      tx.DomainID      = domainID
  return tx
}

export function buildCancelOffer({ account, offerSequence }) {
  return { TransactionType: 'OfferCancel', Account: account, OfferSequence: offerSequence }
}

export async function queryOffers(account, client) {
  const r = await client.request({ command: 'account_offers', account, ledger_index: 'validated' })
  return r.result.offers ?? []
}
