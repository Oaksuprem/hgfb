import assert from 'node:assert/strict'
import test from 'node:test'
import * as xrpl from 'xrpl'
import {
  assetAmount,
  buildCoverDeposit,
  buildLoanBrokerSet,
  buildLoanPay,
  buildLoanSet,
  buildVaultCreate,
  buildVaultDeposit,
  buildVaultWithdraw,
  closedVaultRefusal,
  closedVaultWindow,
  createdLedgerIndex,
  creditAmendmentNote,
  loanPayFlags,
  loanSetReadyToCountersign,
  protocolNumber,
  readSignedLoanSet,
  tenthBasisPoints,
} from '../src/lib/credit.js'
import { buildCreditDomain } from '../src/services/DomainService.js'

const broker = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const borrower = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const id = 'AB'.repeat(32)
const now = new Date('2026-11-19T12:00:00Z')

test('a private XRP vault carries the domain and does not set closed-ended fields', () => {
  const tx = buildVaultCreate({
    account: broker,
    kind: 'xrp',
    domainId: id,
    data: 'Credit vault',
  })
  assert.equal(tx.TransactionType, 'VaultCreate')
  assert.deepEqual(tx.Asset, { currency: 'XRP' })
  assert.equal(tx.DomainID, id)
  assert.equal(tx.Flags, xrpl.VaultCreateFlags.tfVaultPrivate)
  assert.equal(tx.WithdrawalPolicy, 1)
  assert.equal(tx.VaultKind, undefined)
  assert.equal(tx.SubscriptionDate, undefined)
  assert.equal(tx.Scale, undefined)
  assert.equal(tx.Fee, undefined)
  xrpl.validate(tx)
})

test('scale is refused on an XRP vault and accepted on an issued-currency vault', () => {
  assert.throws(
    () => buildVaultCreate({ account: broker, kind: 'xrp', scale: '6' }),
    /Scale applies only/,
  )
  const tx = buildVaultCreate({
    account: broker,
    kind: 'iou',
    currency: 'usd',
    issuer: borrower,
    scale: '6',
    assetsMaximum: '1000',
  })
  assert.deepEqual(tx.Asset, { currency: 'USD', issuer: borrower })
  assert.equal(tx.Scale, 6)
  assert.equal(tx.AssetsMaximum, '1000')
  assert.equal(tx.Flags, undefined)
})

test('a closed-ended vault is sent only with both dates inside the allowed gap', () => {
  assert.throws(
    () => closedVaultWindow('2026-11-19T12:01:00Z', '2026-11-19T12:02:00Z', now),
    /180 seconds/,
  )
  const tx = buildVaultCreate({
    account: broker,
    kind: 'mpt',
    mptIssuanceId: id,
    closed: true,
    subscription: '2026-11-20T12:00:00Z',
    redemption: '2027-11-20T12:00:00Z',
    now,
  })
  assert.equal(tx.Asset.mpt_issuance_id, id)
  assert.equal(tx.VaultKind, 1)
  assert.equal(tx.RedemptionDate - tx.SubscriptionDate, 365 * 86400)
})

test('closed-ended fields are refused before submit when LendingProtocolV1_1 is off', () => {
  assert.match(closedVaultRefusal(false), /not sent/)
  assert.equal(closedVaultRefusal(null), '')
  assert.equal(closedVaultRefusal(true), '')
})

test('loan broker cover rates are a pair, and the management fee is 1/10th basis points', () => {
  assert.equal(tenthBasisPoints('0.1', 10, 'Management fee'), 100)
  assert.throws(
    () => buildLoanBrokerSet({
      account: broker,
      vaultId: id,
      coverMinimumPercent: '10',
      coverLiquidationPercent: '',
      kind: 'xrp',
    }),
    /both be zero or both be set/,
  )
  const tx = buildLoanBrokerSet({
    account: broker,
    vaultId: id,
    managementFeePercent: '0.1',
    coverMinimumPercent: '10',
    coverLiquidationPercent: '5',
    debtMaximum: '1000',
    kind: 'xrp',
  })
  assert.equal(tx.ManagementFeeRate, 100)
  assert.equal(tx.CoverRateMinimum, 10000)
  assert.equal(tx.CoverRateLiquidation, 5000)
  assert.equal(tx.DebtMaximum, '1000000000')
  assert.equal(tx.LoanBrokerID, undefined)
})

test('deposits and first-loss capital use the vault asset, and XRP is drops', () => {
  assert.equal(assetAmount({ kind: 'xrp', value: '1' }), '1000000')
  assert.equal(protocolNumber({ kind: 'xrp', value: '1', label: 'Principal' }), '1000000')
  const deposit = buildVaultDeposit({ account: borrower, vaultId: id, kind: 'xrp', value: '25' })
  assert.equal(deposit.Amount, '25000000')
  const cover = buildCoverDeposit({ account: broker, loanBrokerId: id, kind: 'iou', currency: 'USD', issuer: broker, value: '500' })
  assert.deepEqual(cover.Amount, { currency: 'USD', issuer: broker, value: '500' })
  const shares = buildVaultWithdraw({
    account: borrower,
    vaultId: id,
    redeemShares: true,
    shareIssuanceId: id,
    value: '10',
  })
  assert.deepEqual(shares.Amount, { mpt_issuance_id: id, value: '10' })
})

test('a loan uses the tutorial term units and keeps the two parties distinct', () => {
  assert.throws(
    () => buildLoanSet({
      account: broker,
      counterparty: broker,
      loanBrokerId: id,
      kind: 'xrp',
      principal: '1',
      paymentTotal: '12',
      paymentIntervalDays: '30',
      graceDays: '7',
    }),
    /other account/,
  )
  assert.throws(
    () => buildLoanSet({
      account: broker,
      counterparty: borrower,
      loanBrokerId: id,
      kind: 'xrp',
      principal: '1',
      paymentTotal: '12',
      paymentIntervalDays: '7',
      graceDays: '30',
    }),
    /Grace period/,
  )
  const tx = buildLoanSet({
    account: broker,
    counterparty: borrower,
    loanBrokerId: id,
    kind: 'xrp',
    principal: '1000',
    interestPercent: '0.5',
    paymentTotal: '12',
    paymentIntervalDays: '30',
    graceDays: '7',
    originationFee: '1',
    serviceFee: '0.1',
    allowOverpayment: true,
  })
  assert.equal(tx.PrincipalRequested, '1000000000')
  assert.equal(tx.InterestRate, 500)
  assert.equal(tx.PaymentTotal, 12)
  assert.equal(tx.PaymentInterval, 2592000)
  assert.equal(tx.GracePeriod, 604800)
  assert.equal(tx.LoanOriginationFee, '1000000')
  assert.equal(tx.Flags, xrpl.LoanSetFlags.tfLoanOverpayment)
  assert.equal(tx.CounterpartySignature, undefined)
})

test('an empty broker id is reported before an empty principal', () => {
  assert.throws(
    () => buildLoanSet({
      account: broker,
      counterparty: borrower,
      loanBrokerId: '',
      kind: 'xrp',
      principal: '',
      paymentTotal: '12',
      paymentIntervalDays: '30',
      graceDays: '7',
    }),
    /Loan broker ID/,
  )
})

test('a late payment fee is included only when the terms set one', () => {
  const common = {
    account: broker,
    counterparty: borrower,
    loanBrokerId: id,
    kind: 'iou',
    currency: 'USD',
    issuer: broker,
    principal: '1000',
    paymentTotal: '12',
    paymentIntervalDays: '30',
    graceDays: '7',
  }
  assert.equal(buildLoanSet(common).LatePaymentFee, undefined)
  assert.equal(buildLoanSet({ ...common, latePaymentFee: '5' }).LatePaymentFee, '5')
})

test('an origination fee above the principal is refused', () => {
  assert.throws(
    () => buildLoanSet({
      account: broker,
      counterparty: borrower,
      loanBrokerId: id,
      kind: 'iou',
      currency: 'USD',
      issuer: broker,
      principal: '10',
      paymentTotal: '1',
      paymentIntervalDays: '1',
      graceDays: '0',
      originationFee: '11',
    }),
    /Origination fee/,
  )
})

test('a loan payment enables only one flag', () => {
  assert.equal(loanPayFlags('regular'), undefined)
  assert.equal(loanPayFlags('late'), xrpl.LoanPayFlags.tfLoanLatePayment)
  const tx = buildLoanPay({
    account: borrower,
    loanId: id,
    kind: 'xrp',
    value: '10',
    payment: 'full',
  })
  assert.equal(tx.Flags, xrpl.LoanPayFlags.tfLoanFullPayment)
  assert.equal(tx.Amount, '10000000')
  assert.throws(() => loanPayFlags('late-and-full'), /one loan payment/)
})

test('the domain accepts one KYB credential and does not submit by itself', () => {
  const tx = buildCreditDomain({ account: broker, issuer: broker, credentialType: 'KYB' })
  assert.equal(tx.TransactionType, 'PermissionedDomainSet')
  assert.equal(tx.AcceptedCredentials[0].Credential.CredentialType, xrpl.convertStringToHex('KYB'))
  assert.equal(tx.DomainID, undefined)
})

test('the counterparty signs second and the first signature stays in place', () => {
  const first = xrpl.Wallet.generate()
  const second = xrpl.Wallet.generate()
  const tx = buildLoanSet({
    account: first.address,
    counterparty: second.address,
    loanBrokerId: id,
    kind: 'iou',
    currency: 'USD',
    issuer: broker,
    principal: '1000',
    interestPercent: '0.5',
    paymentTotal: '12',
    paymentIntervalDays: '30',
    graceDays: '7',
  })
  tx.Fee = '12'
  tx.Sequence = 1
  tx.LastLedgerSequence = 20
  const signed = xrpl.decode(first.sign(tx).tx_blob)
  assert.match(loanSetReadyToCountersign(signed, first.address), /counterparty/)
  assert.equal(loanSetReadyToCountersign(signed, second.address), '')
  const full = xrpl.signLoanSetByCounterparty(second, signed)
  assert.equal(full.tx.TxnSignature, signed.TxnSignature)
  assert.ok(full.tx.CounterpartySignature.TxnSignature)
  assert.notEqual(full.tx.CounterpartySignature.TxnSignature, full.tx.TxnSignature)
  xrpl.validate(full.tx)
  assert.equal(readSignedLoanSet(JSON.stringify(signed)).Account, first.address)
})

test('amendment copy follows the flags the network actually reports', () => {
  assert.equal(creditAmendmentNote({ vault: null, lending: null, v11: null }).tone, 'info')
  assert.match(creditAmendmentNote({ vault: false, lending: true, v11: false }).text, /will be rejected/)
  assert.match(creditAmendmentNote({ vault: true, lending: true, v11: false }).text, /open-ended/)
  assert.match(creditAmendmentNote({ vault: true, lending: true, v11: true }).text, /closed-ended/)
})

test('a created vault id is read from the ledger node', () => {
  const found = createdLedgerIndex({
    result: { meta: { AffectedNodes: [
      { CreatedNode: { LedgerEntryType: 'MPTokenIssuance', LedgerIndex: '11' } },
      { CreatedNode: { LedgerEntryType: 'Vault', LedgerIndex: id } },
    ] } },
  }, 'Vault')
  assert.equal(found, id)
})
