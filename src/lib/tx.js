import * as xrpl from 'xrpl'
import { formatAmount, formatBalanceChange } from './holdings.js'

const TYPE_LABELS = {
  Payment: 'Payment',
  OfferCreate: 'Order',
  OfferCancel: 'Cancel order',
  TrustSet: 'Trust line',
  AccountSet: 'Account settings',
  SignerListSet: 'Co-signers',
  NFTokenMint: 'Mint NFT',
  NFTokenBurn: 'Burn NFT',
  NFTokenCreateOffer: 'NFT offer',
  NFTokenAcceptOffer: 'Accept NFT offer',
  NFTokenCancelOffer: 'Cancel NFT offer',
  NFTokenModify: 'Update NFT',
  MPTokenIssuanceCreate: 'Create MPT',
  MPTokenIssuanceDestroy: 'Destroy MPT',
  MPTokenIssuanceSet: 'Update MPT',
  MPTokenAuthorize: 'Authorize MPT',
  Clawback: 'Clawback',
  TicketCreate: 'Tickets',
  EscrowCreate: 'Escrow',
  EscrowFinish: 'Escrow finish',
  EscrowCancel: 'Escrow cancel',
  DepositPreauth: 'Deposit auth',
}

export function txOutcome(result) {
  const tes = result?.result?.meta?.TransactionResult
  const hash = result?.result?.hash
  return { ok: tes === 'tesSUCCESS', tes, hash }
}

export function unwrapAccountTx(wrap) {
  const tx = wrap.tx_json || wrap.tx || wrap.transaction || {}
  const meta = wrap.meta ?? wrap.metaData ?? {}
  const hash = wrap.hash || tx.hash
  const ledgerIndex = wrap.ledger_index || tx.ledger_index
  return { tx, meta, hash, ledgerIndex, validated: wrap.validated !== false }
}

function fmtIssued(amt) {
  return formatAmount(amt)
}

function deliveredLine(tx, meta) {
  const delivered = meta.delivered_amount ?? meta.DeliveredAmount
  if (delivered != null) return fmtIssued(delivered)
  if (tx.TransactionType === 'Payment') return fmtIssued(tx.Amount)
  if (tx.TransactionType === 'OfferCreate') {
    const gets = fmtIssued(tx.TakerGets)
    const pays = fmtIssued(tx.TakerPays)
    if (gets && pays) return `Sell ${gets} · Buy ${pays}`
  }
  if (tx.LimitAmount) return `Limit ${fmtIssued(tx.LimitAmount)}`
  return null
}

function balanceLine(meta, address) {
  try {
    const changes = xrpl.getBalanceChanges(meta)
    const mine = changes.find(c => c.account === address)
    if (!mine?.balances?.length) return null
    return mine.balances.map(formatBalanceChange).join('  ·  ')
  } catch {
    return null
  }
}

function directionOf(tx, address) {
  const type = tx.TransactionType
  if (type === 'Payment') {
    if (tx.Account === address && tx.Destination === address) return 'self'
    if (tx.Account === address) return 'out'
    if (tx.Destination === address) return 'in'
  }
  if (tx.Account === address) return 'out'
  return 'in'
}

export function normalizeAccountTx(wrap, address) {
  const { tx, meta, hash, ledgerIndex } = unwrapAccountTx(wrap)
  const tes = typeof meta === 'string' ? null : meta.TransactionResult
  const ok = tes === 'tesSUCCESS'
  const type = tx.TransactionType || 'Unknown'
  let ts = Date.now()
  if (typeof tx.date === 'number') {
    try { ts = xrpl.rippleTimeToUnixTime(tx.date) } catch { ts = Date.now() }
  }
  const amount = balanceLine(meta, address) || deliveredLine(tx, meta)
  return {
    hash,
    type,
    label: TYPE_LABELS[type] || type,
    status: ok ? 'success' : (tes ? 'error' : 'pending'),
    tes,
    amount,
    direction: directionOf(tx, address),
    ts,
    ledgerIndex,
    counterparty: tx.Account === address ? tx.Destination : tx.Account,
  }
}

export function formatAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60) return d + 's ago'
  if (d < 3600) return Math.floor(d / 60) + 'm ago'
  if (d < 86400) return Math.floor(d / 3600) + 'h ago'
  return Math.floor(d / 86400) + 'd ago'
}
