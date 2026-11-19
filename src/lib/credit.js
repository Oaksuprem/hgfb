/**
 * Institutional credit transactions.
 * Builders only. Nothing here connects or submits.
 * Amounts for XRP are converted to drops. Rates are entered as percents
 * and stored as 1/10th basis points, matching the lending protocol.
 */
import * as xrpl from 'xrpl'
import { RIPPLE_EPOCH_OFFSET } from './time.js'

const MIN_VAULT_GAP = 180
const MAX_VAULT_GAP = 946708560

function requireAccount(account) {
  const address = String(account ?? '').trim()
  if (!xrpl.isValidClassicAddress(address)) throw new Error('Account must be a classic address.')
  return address
}

export function ledgerId(value, label) {
  const id = String(value ?? '').trim()
  if (!/^[0-9A-Fa-f]{64}$/.test(id) || /^0{64}$/i.test(id)) {
    throw new Error(`${label} must be a 64-character hex id.`)
  }
  return id
}

function numberText(value, label, { allowZero = false } = {}) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`${label} must be a number.`)
  if (/^0+(\.0+)?$/.test(raw)) {
    if (!allowZero) throw new Error(`${label} must be greater than zero.`)
    return '0'
  }
  return raw
}

function issuedCurrency(currency, issuer) {
  const code = String(currency ?? '').trim().toUpperCase()
  const address = String(issuer ?? '').trim()
  const standard = /^[A-Z0-9]{3}$/.test(code) && code !== 'XRP'
  const hex = /^[0-9A-F]{40}$/.test(code)
  if (!standard && !hex) throw new Error('Currency must be a 3-character code or a 40-character hex code.')
  if (!xrpl.isValidClassicAddress(address)) throw new Error('Currency issuer must be a classic address.')
  return { currency: code, issuer: address }
}

export function vaultAsset({ kind, currency, issuer, mptIssuanceId }) {
  if (kind === 'xrp') return { currency: 'XRP' }
  if (kind === 'mpt') return { mpt_issuance_id: ledgerId(mptIssuanceId, 'MPT issuance ID') }
  if (kind === 'iou') return issuedCurrency(currency, issuer)
  throw new Error('Choose XRP, an issued currency, or a multi-purpose token.')
}

export function assetAmount({ kind, currency, issuer, mptIssuanceId, value, label = 'Amount', allowZero = false }) {
  const raw = numberText(value, label, { allowZero })
  if (raw === '0') {
    if (kind === 'xrp') return '0'
    if (kind === 'mpt') return { mpt_issuance_id: ledgerId(mptIssuanceId, 'MPT issuance ID'), value: '0' }
    if (kind === 'iou') return { ...issuedCurrency(currency, issuer), value: '0' }
  }
  if (kind === 'xrp') return xrpl.xrpToDrops(raw)
  if (kind === 'mpt') {
    if (raw.includes('.')) throw new Error(`${label} for a multi-purpose token must be a whole number.`)
    return { mpt_issuance_id: ledgerId(mptIssuanceId, 'MPT issuance ID'), value: raw }
  }
  if (kind === 'iou') return { ...issuedCurrency(currency, issuer), value: raw }
  throw new Error('Choose XRP, an issued currency, or a multi-purpose token.')
}

export function protocolNumber({ kind, currency, issuer, mptIssuanceId, value, label, allowZero = false }) {
  const raw = numberText(value, label, { allowZero })
  if (raw === '0') return '0'
  if (kind === 'xrp') return xrpl.xrpToDrops(raw)
  if (kind === 'mpt') {
    if (raw.includes('.')) throw new Error(`${label} for a multi-purpose token must be a whole number.`)
    ledgerId(mptIssuanceId, 'MPT issuance ID')
    return raw
  }
  if (kind === 'iou') {
    issuedCurrency(currency, issuer)
    return raw
  }
  throw new Error('Choose XRP, an issued currency, or a multi-purpose token.')
}

export function tenthBasisPoints(percent, maxPercent, label) {
  if (percent == null) return null
  const text = String(percent).trim()
  if (!text) return null
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`${label} must be a percent from 0 to ${maxPercent}.`)
  }
  const [whole, frac = ''] = text.split('.')
  if (frac.length > 3) throw new Error(`${label} can use at most three decimal places.`)
  const units = Number(whole) * 1000 + Number((frac + '000').slice(0, 3))
  if (units > maxPercent * 1000) throw new Error(`${label} cannot be more than ${maxPercent}%.`)
  return units
}

function coverRates(minimumPercent, liquidationPercent) {
  const minBlank = String(minimumPercent ?? '').trim() === ''
  const liqBlank = String(liquidationPercent ?? '').trim() === ''
  if (minBlank && liqBlank) return {}
  const minimum = minBlank ? 0 : tenthBasisPoints(minimumPercent, 100, 'Minimum cover')
  const liquidation = liqBlank ? 0 : tenthBasisPoints(liquidationPercent, 100, 'Liquidation cover')
  if ((minimum === 0) !== (liquidation === 0)) {
    throw new Error('Minimum cover and liquidation cover must both be zero or both be set.')
  }
  return { CoverRateMinimum: minimum, CoverRateLiquidation: liquidation }
}

function optionalData(text, maxBytes, label) {
  const raw = String(text ?? '').trim()
  if (!raw) return undefined
  const hex = xrpl.convertStringToHex(raw)
  if (hex.length / 2 > maxBytes) throw new Error(`${label} is longer than ${maxBytes} bytes.`)
  return hex
}

function futureRippleTime(value, now, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} is required for a closed-ended vault.`)
  const ms = new Date(text).getTime()
  if (!Number.isFinite(ms)) throw new Error(`${label} is not a valid date.`)
  if (ms <= now.getTime()) throw new Error(`${label} must be in the future.`)
  return Math.floor(ms / 1000) - RIPPLE_EPOCH_OFFSET
}

export function closedVaultWindow(subscription, redemption, now = new Date()) {
  const start = futureRippleTime(subscription, now, 'Subscription date')
  const end = futureRippleTime(redemption, now, 'Redemption date')
  const gap = end - start
  if (gap < MIN_VAULT_GAP || gap >= MAX_VAULT_GAP) {
    throw new Error('Redemption must be at least 180 seconds after subscription and less than 30 years after it.')
  }
  return { VaultKind: 1, SubscriptionDate: start, RedemptionDate: end }
}

export function closedVaultRefusal(v11Enabled) {
  if (v11Enabled === false) {
    return 'Closed-ended vault fields require LendingProtocolV1_1. That amendment is not enabled, so this vault is not sent.'
  }
  return ''
}

export function creditAmendmentNote({ vault, lending, v11 }) {
  if (vault === false || lending === false) {
    return {
      tone: 'warning',
      text: 'Single Asset Vaults or the Lending Protocol is not enabled on this network. A vault or loan transaction will be rejected.',
    }
  }
  if (v11 === false) {
    return {
      tone: 'info',
      text: 'LendingProtocolV1_1 is not enabled. A new loan broker can use an open-ended vault. Closed-ended dates stay off the vault until that amendment is on.',
    }
  }
  if (v11 === true) {
    return {
      tone: 'info',
      text: 'LendingProtocolV1_1 is enabled. A new loan broker has to use a closed-ended vault.',
    }
  }
  if (vault === true && lending === true) {
    return {
      tone: 'success',
      text: 'Single Asset Vaults and the Lending Protocol are enabled. Closed-ended vault status is not listed yet.',
    }
  }
  return { tone: 'info', text: 'Amendment status is not available yet. Nothing is sent until you submit.' }
}

export function daysToSeconds(days, label) {
  const text = String(days ?? '').trim()
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a whole number of days.`)
  return Number(text) * 86400
}

function greaterThan(left, right) {
  const [aw, af = ''] = String(left).split('.')
  const [bw, bf = ''] = String(right).split('.')
  const scale = Math.max(af.length, bf.length)
  return BigInt(aw + af.padEnd(scale, '0')) > BigInt(bw + bf.padEnd(scale, '0'))
}

export function buildVaultCreate({
  account,
  kind,
  currency,
  issuer,
  mptIssuanceId,
  assetsMaximum,
  data,
  domainId,
  scale,
  closed = false,
  subscription,
  redemption,
  nonTransferable = false,
  now,
}) {
  const tx = {
    TransactionType: 'VaultCreate',
    Account: requireAccount(account),
    Asset: vaultAsset({ kind, currency, issuer, mptIssuanceId }),
    WithdrawalPolicy: xrpl.VaultWithdrawalPolicy.vaultStrategyFirstComeFirstServe,
  }
  let flags = 0
  if (String(domainId ?? '').trim()) {
    tx.DomainID = ledgerId(domainId, 'Domain ID')
    flags |= xrpl.VaultCreateFlags.tfVaultPrivate
  }
  if (nonTransferable) flags |= xrpl.VaultCreateFlags.tfVaultShareNonTransferable
  if (flags) tx.Flags = flags
  if (kind === 'iou' && String(scale ?? '').trim() !== '') {
    const parsed = Number(String(scale).trim())
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 18) {
      throw new Error('Scale must be a whole number from 0 to 18.')
    }
    tx.Scale = parsed
  } else if (kind !== 'iou' && String(scale ?? '').trim() !== '') {
    throw new Error('Scale applies only to an issued currency.')
  }
  if (String(assetsMaximum ?? '').trim() !== '') {
    tx.AssetsMaximum = protocolNumber({
      kind, currency, issuer, mptIssuanceId,
      value: assetsMaximum,
      label: 'Asset cap',
      allowZero: true,
    })
  }
  const encoded = optionalData(data, 256, 'Vault data')
  if (encoded) tx.Data = encoded
  if (closed) Object.assign(tx, closedVaultWindow(subscription, redemption, now))
  xrpl.validate(tx)
  return tx
}

export function buildLoanBrokerSet({
  account,
  vaultId,
  managementFeePercent,
  coverMinimumPercent,
  coverLiquidationPercent,
  debtMaximum,
  kind,
  currency,
  issuer,
  mptIssuanceId,
  data,
}) {
  const tx = {
    TransactionType: 'LoanBrokerSet',
    Account: requireAccount(account),
    VaultID: ledgerId(vaultId, 'Vault ID'),
    ...coverRates(coverMinimumPercent, coverLiquidationPercent),
  }
  const fee = tenthBasisPoints(managementFeePercent, 10, 'Management fee')
  if (fee != null) tx.ManagementFeeRate = fee
  if (String(debtMaximum ?? '').trim() !== '') {
    tx.DebtMaximum = protocolNumber({
      kind, currency, issuer, mptIssuanceId,
      value: debtMaximum,
      label: 'Debt maximum',
      allowZero: true,
    })
  }
  const encoded = optionalData(data, 256, 'Broker data')
  if (encoded) tx.Data = encoded
  xrpl.validate(tx)
  return tx
}

export function buildCoverDeposit({ account, loanBrokerId, kind, currency, issuer, mptIssuanceId, value }) {
  const tx = {
    TransactionType: 'LoanBrokerCoverDeposit',
    Account: requireAccount(account),
    LoanBrokerID: ledgerId(loanBrokerId, 'Loan broker ID'),
    Amount: assetAmount({ kind, currency, issuer, mptIssuanceId, value, label: 'First-loss capital' }),
  }
  xrpl.validate(tx)
  return tx
}

export function buildCoverWithdraw({
  account,
  loanBrokerId,
  kind,
  currency,
  issuer,
  mptIssuanceId,
  value,
  destination,
  destinationTag,
}) {
  const tx = {
    TransactionType: 'LoanBrokerCoverWithdraw',
    Account: requireAccount(account),
    LoanBrokerID: ledgerId(loanBrokerId, 'Loan broker ID'),
    Amount: assetAmount({ kind, currency, issuer, mptIssuanceId, value, label: 'First-loss capital' }),
  }
  assignDestination(tx, destination, destinationTag)
  xrpl.validate(tx)
  return tx
}

export function buildVaultDeposit({ account, vaultId, kind, currency, issuer, mptIssuanceId, value }) {
  const tx = {
    TransactionType: 'VaultDeposit',
    Account: requireAccount(account),
    VaultID: ledgerId(vaultId, 'Vault ID'),
    Amount: assetAmount({ kind, currency, issuer, mptIssuanceId, value, label: 'Deposit' }),
  }
  xrpl.validate(tx)
  return tx
}

export function buildVaultWithdraw({
  account,
  vaultId,
  kind,
  currency,
  issuer,
  mptIssuanceId,
  value,
  redeemShares = false,
  shareIssuanceId,
  destination,
  destinationTag,
}) {
  const tx = {
    TransactionType: 'VaultWithdraw',
    Account: requireAccount(account),
    VaultID: ledgerId(vaultId, 'Vault ID'),
    Amount: redeemShares
      ? assetAmount({
        kind: 'mpt',
        mptIssuanceId: shareIssuanceId,
        value,
        label: 'Shares',
      })
      : assetAmount({ kind, currency, issuer, mptIssuanceId, value, label: 'Withdrawal' }),
  }
  assignDestination(tx, destination, destinationTag)
  xrpl.validate(tx)
  return tx
}

function assignDestination(tx, destination, destinationTag) {
  const dest = String(destination ?? '').trim()
  const tagText = String(destinationTag ?? '').trim()
  if (tagText && !dest) throw new Error('A destination tag needs a destination.')
  if (dest) {
    if (!xrpl.isValidClassicAddress(dest)) throw new Error('Destination must be a classic address.')
    tx.Destination = dest
  }
  if (tagText) {
    const tag = Number(tagText)
    if (!Number.isInteger(tag) || tag < 0) throw new Error('Destination tag must be a whole number.')
    tx.DestinationTag = tag
  }
}

export function buildLoanSet({
  account,
  counterparty,
  loanBrokerId,
  kind,
  currency,
  issuer,
  mptIssuanceId,
  principal,
  interestPercent,
  paymentTotal,
  paymentIntervalDays,
  graceDays,
  originationFee,
  serviceFee,
  lateInterestPercent,
  latePaymentFee,
  closeInterestPercent,
  closePaymentFee,
  overpaymentFeePercent,
  allowOverpayment = false,
}) {
  const first = requireAccount(account)
  const brokerId = ledgerId(loanBrokerId, 'Loan broker ID')
  const second = String(counterparty ?? '').trim()
  if (!xrpl.isValidClassicAddress(second)) throw new Error('Counterparty must be a classic address.')
  if (first === second) throw new Error('The counterparty is the other account. This book signs first.')
  const principalValue = protocolNumber({
    kind, currency, issuer, mptIssuanceId,
    value: principal,
    label: 'Principal',
  })
  const payments = Number(String(paymentTotal ?? '').trim())
  if (!Number.isInteger(payments) || payments < 1) {
    throw new Error('Payment count must be a whole number of at least 1.')
  }
  const interval = daysToSeconds(paymentIntervalDays, 'Payment interval')
  const grace = daysToSeconds(graceDays, 'Grace period')
  if (interval < 60) throw new Error('Payment interval must be at least 60 seconds.')
  if (grace > interval) throw new Error('Grace period cannot be longer than the payment interval.')
  const tx = {
    TransactionType: 'LoanSet',
    Account: first,
    Counterparty: second,
    LoanBrokerID: brokerId,
    PrincipalRequested: principalValue,
    PaymentTotal: payments,
    PaymentInterval: interval,
    GracePeriod: grace,
  }
  const interest = tenthBasisPoints(interestPercent, 100, 'Interest')
  if (interest != null) tx.InterestRate = interest
  const lateInterest = tenthBasisPoints(lateInterestPercent, 100, 'Late interest')
  if (lateInterest != null) tx.LateInterestRate = lateInterest
  const closeInterest = tenthBasisPoints(closeInterestPercent, 100, 'Early repayment interest')
  if (closeInterest != null) tx.CloseInterestRate = closeInterest
  const overRate = tenthBasisPoints(overpaymentFeePercent, 100, 'Overpayment fee')
  if (overRate != null) tx.OverpaymentFee = overRate
  const origination = optionalProtocolNumber({
    kind, currency, issuer, mptIssuanceId,
    value: originationFee,
    label: 'Origination fee',
  })
  if (origination != null) {
    if (greaterThan(origination, principalValue)) {
      throw new Error('Origination fee cannot be more than the principal.')
    }
    tx.LoanOriginationFee = origination
  }
  const service = optionalProtocolNumber({
    kind, currency, issuer, mptIssuanceId,
    value: serviceFee,
    label: 'Service fee',
  })
  if (service != null) tx.LoanServiceFee = service
  const lateFee = optionalProtocolNumber({
    kind, currency, issuer, mptIssuanceId,
    value: latePaymentFee,
    label: 'Late payment fee',
  })
  if (lateFee != null) tx.LatePaymentFee = lateFee
  const closeFee = optionalProtocolNumber({
    kind, currency, issuer, mptIssuanceId,
    value: closePaymentFee,
    label: 'Early repayment fee',
  })
  if (closeFee != null) tx.ClosePaymentFee = closeFee
  if (allowOverpayment) tx.Flags = xrpl.LoanSetFlags.tfLoanOverpayment
  xrpl.validate(tx)
  return tx
}

function optionalProtocolNumber(input) {
  if (String(input.value ?? '').trim() === '') return undefined
  return protocolNumber(input)
}

export function loanPayFlags(payment) {
  if (!payment || payment === 'regular') return undefined
  if (payment === 'overpayment') return xrpl.LoanPayFlags.tfLoanOverpayment
  if (payment === 'full') return xrpl.LoanPayFlags.tfLoanFullPayment
  if (payment === 'late') return xrpl.LoanPayFlags.tfLoanLatePayment
  throw new Error('Choose one loan payment type.')
}

export function buildLoanPay({ account, loanId, kind, currency, issuer, mptIssuanceId, value, payment = 'regular' }) {
  const flags = loanPayFlags(payment)
  const tx = {
    TransactionType: 'LoanPay',
    Account: requireAccount(account),
    LoanID: ledgerId(loanId, 'Loan ID'),
    Amount: assetAmount({ kind, currency, issuer, mptIssuanceId, value, label: 'Payment' }),
  }
  if (flags) tx.Flags = flags
  xrpl.validate(tx)
  return tx
}

export function readSignedLoanSet(text) {
  const raw = String(text ?? '').trim()
  if (!raw) throw new Error('Paste the first party’s signed loan.')
  let tx
  try {
    tx = raw.startsWith('{') ? JSON.parse(raw) : xrpl.decode(raw)
  } catch {
    throw new Error('The signed loan could not be read.')
  }
  if (!tx || tx.TransactionType !== 'LoanSet') throw new Error('That transaction is not a LoanSet.')
  return tx
}

export function loanSetReadyToCountersign(tx, walletAddress) {
  if (!tx || tx.TransactionType !== 'LoanSet') return 'Paste the first party’s signed loan.'
  if (!tx.TxnSignature || !tx.SigningPubKey) return 'The first party has not signed this loan.'
  if (tx.CounterpartySignature) return 'This loan already has the counterparty signature.'
  if (!walletAddress || walletAddress !== tx.Counterparty) {
    return 'Open the counterparty’s book. That account signs second.'
  }
  return ''
}

export function createdLedgerIndex(result, ledgerEntryType) {
  const nodes = result?.result?.meta?.AffectedNodes || []
  const node = nodes.find(entry => entry.CreatedNode?.LedgerEntryType === ledgerEntryType)
  return node?.CreatedNode?.LedgerIndex || ''
}
