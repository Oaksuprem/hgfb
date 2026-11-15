import { amountOf } from './amounts.js'
import {
  amountNote,
  clearingAmount,
  findCurrencyLine,
  linesWithPeer,
  paymentSendMax,
  planFromLines,
} from './pathfix.js'

const PATH_PARTIAL = 'Only part of that amount can move, so it was not sent. Lower it to the balance after the transfer fee and the receiver’s remaining trust limit.'
const PATH_DRY = 'No path can move this asset. The receiver needs a trust line, and the issuer must allow rippling on the existing lines.'
const NOTHING_CLEARS = 'That amount cannot be delivered in full. The balance, transfer fee, or the receiver’s trust limit leaves nothing that can clear.'

export function ledgerErrorMessage(error, prefix = 'Payment didn’t land: ') {
  const msg = error?.message || String(error)
  if (/actNotFound/.test(msg)) return 'The receiver has no account or no trust line for this asset yet.'
  return prefix + msg
}

export function paymentResultMessage(tes) {
  if (tes === 'tecPATH_PARTIAL') return PATH_PARTIAL
  if (tes === 'tecPATH_DRY') return PATH_DRY
  return tes || 'Didn’t clear'
}

export function buildPayment({ account, destination, amount, sendMax, destTag, memoHex }) {
  const tx = {
    TransactionType: 'Payment',
    Account: account,
    Destination: destination,
    Amount: amount,
  }
  if (sendMax && amount && typeof amount === 'object') {
    tx.SendMax = { currency: amount.currency, issuer: amount.issuer, value: String(sendMax) }
  }
  if (destTag) tx.DestinationTag = Number(destTag)
  if (memoHex) tx.Memos = [{ Memo: { MemoData: memoHex } }]
  return tx
}

export function xrpPayment({ xrpl, account, destination, amount, destTag, memoHex }) {
  return buildPayment({
    account,
    destination,
    amount: amountOf(xrpl, { code: 'XRP' }, amount),
    destTag,
    memoHex,
  })
}

export async function prepareIssuedPayment(client, { sender, destination, amount, currency, issuer }) {
  const senderIsIssuer = sender === issuer
  let issuerInfo
  let senderLines
  let destLines
  try {
    ;[issuerInfo, senderLines, destLines] = await Promise.all([
      client.request({ command: 'account_info', account: issuer, ledger_index: 'validated' }),
      senderIsIssuer ? Promise.resolve([]) : linesWithPeer(client, sender, issuer),
      linesWithPeer(client, destination, issuer),
    ])
  } catch (error) {
    const msg = error?.message || String(error)
    if (/actNotFound/.test(msg)) {
      return { ok: false, code: 'tecPATH_DRY', message: 'The receiver has no account or no trust line for this asset yet.' }
    }
    throw error
  }

  const senderLine = findCurrencyLine(senderLines, currency)
  const destLine = findCurrencyLine(destLines, currency)
  const transferRate = issuerInfo.result.account_data.TransferRate
  const plan = planFromLines({
    amount,
    senderIsIssuer,
    senderLine,
    destLine,
    transferRate,
  })
  if (!plan.ok) return plan

  const ledgerCurrency = destLine?.currency || senderLine?.currency || currency
  const cleared = await clearingAmount(client, {
    source: sender,
    destination,
    currency: ledgerCurrency,
    issuer,
    amount: plan.amount,
  })
  if (cleared.checked && !(Number(cleared.amount) > 0)) {
    return { ok: false, code: 'tecPATH_PARTIAL', message: NOTHING_CLEARS }
  }

  const sendValue = cleared.checked ? cleared.amount : plan.amount
  return {
    ok: true,
    amount: sendValue,
    currency: ledgerCurrency,
    issuer,
    sendMax: paymentSendMax({
      amount: sendValue,
      transferRate,
      senderIsIssuer,
      balance: senderLine?.balance || '0',
      sourceAmount: cleared.sourceAmount,
    }),
    note: amountNote(amount, sendValue),
  }
}
