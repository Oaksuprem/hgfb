/**
 * Batch Configuration Parser, Formatter, Validator, and Pretty-Printer.
 */
import * as xrpl from 'xrpl'

// ── Known XRPL transaction types ─────────────────────────────────────────────
export const KNOWN_TX_TYPES = new Set([
  'Payment','OfferCreate','OfferCancel','TrustSet','AccountSet',
  'SignerListSet','NFTokenMint','NFTokenBurn','NFTokenCreateOffer',
  'NFTokenAcceptOffer','NFTokenCancelOffer','NFTokenModify',
  'MPTokenIssuanceCreate','MPTokenIssuanceDestroy','MPTokenIssuanceSet',
  'MPTokenAuthorize','TicketCreate','CredentialCreate','CredentialAccept',
  'CredentialDelete','PermissionedDomainSet','PermissionedDomainDelete',
  'OracleSet','OracleDelete','AMMCreate','AMMDeposit','AMMWithdraw',
  'AMMVote','AMMBid','Clawback','EscrowCreate','EscrowFinish','EscrowCancel',
  'DepositPreauth',
])

// Required fields per transaction type
const REQUIRED_FIELDS = {
  Payment:                  ['Account','Destination','Amount'],
  OfferCreate:              ['Account','TakerGets','TakerPays'],
  OfferCancel:              ['Account','OfferSequence'],
  TrustSet:                 ['Account','LimitAmount'],
  AccountSet:               ['Account'],
  SignerListSet:            ['Account','SignerQuorum'],
  NFTokenMint:              ['Account','NFTokenTaxon'],
  NFTokenBurn:              ['Account','NFTokenID'],
  NFTokenCreateOffer:       ['Account','NFTokenID','Amount'],
  NFTokenAcceptOffer:       ['Account'],
  NFTokenCancelOffer:       ['Account','NFTokenOffers'],
  NFTokenModify:            ['Account','NFTokenID'],
  MPTokenIssuanceCreate:    ['Account'],
  MPTokenIssuanceDestroy:   ['Account','MPTokenIssuanceID'],
  MPTokenIssuanceSet:       ['Account','MPTokenIssuanceID'],
  MPTokenAuthorize:         ['Account','MPTokenIssuanceID'],
  TicketCreate:             ['Account','TicketCount'],
  CredentialCreate:         ['Account','Subject','CredentialType'],
  CredentialAccept:         ['Account','Issuer','CredentialType'],
  CredentialDelete:         ['Account','CredentialType'],
  PermissionedDomainSet:    ['Account'],
  PermissionedDomainDelete: ['Account'],
  OracleSet:                ['Account','OracleDocumentID','LastUpdateTime','PriceDataSeries'],
  OracleDelete:             ['Account','OracleDocumentID'],
  AMMCreate:                ['Account','Amount','Amount2','TradingFee'],
  AMMDeposit:               ['Account','Asset','Asset2'],
  AMMWithdraw:              ['Account','Asset','Asset2'],
  AMMVote:                  ['Account','Asset','Asset2','TradingFee'],
  AMMBid:                   ['Account','Asset','Asset2'],
  Clawback:                 ['Account','Amount'],
  EscrowCreate:             ['Account','Destination','Amount'],
  EscrowFinish:             ['Account','Owner','OfferSequence'],
  EscrowCancel:             ['Account','Owner','OfferSequence'],
  DepositPreauth:           ['Account'],
}

// ── Parse ─────────────────────────────────────────────────────────────────────
/**
 * Parse JSON string or plain object into array of transaction field objects.
 * Throws on invalid JSON or unexpected structure.
 */
export function parseBatchConfiguration(input) {
  let data = typeof input === 'string' ? JSON.parse(input) : input
  if (!Array.isArray(data)) throw new Error('Batch configuration must be an array')
  return data.map((item, i) => {
    if (typeof item !== 'object' || item === null) throw new Error(`Transaction at index ${i} must be an object`)
    return { ...item }
  })
}

// ── Format ────────────────────────────────────────────────────────────────────
/**
 * Serialize array of transaction field objects to a JSON string with 2-space indent.
 */
export function formatBatchConfiguration(transactions) {
  return JSON.stringify(transactions, null, 2)
}

// ── Pretty-print ──────────────────────────────────────────────────────────────
/**
 * Returns a formatted summary string of the batch for debugging.
 */
export function prettyPrintBatch(transactions) {
  return transactions.map((tx, i) =>
    `[${i}] ${tx.TransactionType ?? '?'} · Account: ${tx.Account ?? '?'}\n` +
    JSON.stringify(tx, null, 2)
  ).join('\n\n')
}

// ── Validate ──────────────────────────────────────────────────────────────────
/**
 * Validate batch configuration.
 * Returns array of { index, field, message } — empty array means valid.
 */
export function validateBatchConfiguration(transactions) {
  const errors = []

  transactions.forEach((tx, index) => {
    // 1. Transaction type check
    if (!tx.TransactionType) {
      errors.push({ index, field: 'TransactionType', message: 'TransactionType is required' })
      return  // can't validate further without type
    }
    if (!KNOWN_TX_TYPES.has(tx.TransactionType)) {
      errors.push({ index, field: 'TransactionType', message: `Unknown transaction type: ${tx.TransactionType}` })
    }

    // 2. Required fields
    const required = REQUIRED_FIELDS[tx.TransactionType] ?? ['Account']
    for (const field of required) {
      if (tx[field] === undefined || tx[field] === null || tx[field] === '') {
        errors.push({ index, field, message: `Required field ${field} is missing` })
      }
    }

    // 3. Address validation
    for (const field of ['Account','Destination','Owner','Subject','Issuer','Holder']) {
      if (tx[field] !== undefined && tx[field] !== '' && !xrpl.isValidAddress(tx[field])) {
        errors.push({ index, field, message: `Invalid XRPL address in field ${field}: ${tx[field]}` })
      }
    }

    // 4. Currency code format
    function validateCurrency(val, field) {
      if (typeof val === 'string') {
        const ok3  = /^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/.test(val)
        const ok40 = /^[0-9A-Fa-f]{40}$/.test(val)
        if (!ok3 && !ok40) {
          errors.push({ index, field, message: `${field} currency must be 3-char or 40-char hex, got: ${val}` })
        }
      } else if (val && typeof val === 'object') {
        if (val.currency) validateCurrency(val.currency, `${field}.currency`)
      }
    }
    for (const amountField of ['Amount','Amount2','TakerGets','TakerPays','SendMax','DeliverMin','LimitAmount']) {
      if (tx[amountField]) validateCurrency(tx[amountField], amountField)
    }
  })

  return errors
}
