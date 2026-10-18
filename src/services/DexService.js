/**
 * DexService — pure builders for DEX (order book) and AMM operations.
 */

export function buildCreateOffer({ account, takerGets, takerPays, expiration, offerSequence, domainID, flags = {} }) {
  let f = 0
  if (flags.passive)             f |= 0x00010000
  if (flags.immediateOrCancel)   f |= 0x00020000
  if (flags.fillOrKill)          f |= 0x00040000
  if (flags.sell)                f |= 0x00080000
  const tx = { TransactionType: 'OfferCreate', Account: account, TakerGets: takerGets, TakerPays: takerPays }
  if (f) tx.Flags = f
  if (expiration)    tx.Expiration    = Math.floor(new Date(expiration).getTime() / 1000) - 946684800
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

export function buildCreateAMM({ account, amount, amount2, tradingFee }) {
  return { TransactionType: 'AMMCreate', Account: account, Amount: amount, Amount2: amount2, TradingFee: tradingFee }
}

export function buildDepositAMM({ account, asset, asset2, amount, amount2, lpTokenOut, flags = {} }) {
  let f = 0
  if (flags.lpToken)        f |= 0x00010000
  if (flags.singleAsset)    f |= 0x00080000
  if (flags.twoAsset)       f |= 0x00100000
  if (flags.oneAssetLPToken)f |= 0x00200000
  if (flags.limitLPToken)   f |= 0x00400000
  const tx = { TransactionType: 'AMMDeposit', Account: account, Asset: asset, Asset2: asset2 }
  if (f)          tx.Flags     = f
  if (amount)     tx.Amount    = amount
  if (amount2)    tx.Amount2   = amount2
  if (lpTokenOut) tx.LPTokenOut= lpTokenOut
  return tx
}

export function buildWithdrawAMM({ account, asset, asset2, amount, amount2, lpTokenIn, flags = {} }) {
  let f = 0
  if (flags.lpToken)        f |= 0x00010000
  if (flags.withdrawAll)    f |= 0x00020000
  if (flags.singleAsset)    f |= 0x00080000
  if (flags.twoAsset)       f |= 0x00100000
  if (flags.oneAssetLPToken)f |= 0x00200000
  if (flags.limitLPToken)   f |= 0x00400000
  const tx = { TransactionType: 'AMMWithdraw', Account: account, Asset: asset, Asset2: asset2 }
  if (f)        tx.Flags    = f
  if (amount)   tx.Amount   = amount
  if (amount2)  tx.Amount2  = amount2
  if (lpTokenIn)tx.LPTokenIn= lpTokenIn
  return tx
}

export function buildVoteAMM({ account, asset, asset2, tradingFee }) {
  return { TransactionType: 'AMMVote', Account: account, Asset: asset, Asset2: asset2, TradingFee: tradingFee }
}

export function buildBidAMM({ account, asset, asset2, bidMin, bidMax, authAccounts }) {
  const tx = { TransactionType: 'AMMBid', Account: account, Asset: asset, Asset2: asset2 }
  if (bidMin) tx.BidMin = bidMin
  if (bidMax) tx.BidMax = bidMax
  if (authAccounts?.length) tx.AuthAccounts = authAccounts.map(a => ({ AuthAccount: { Account: a.account ?? a } }))
  return tx
}
