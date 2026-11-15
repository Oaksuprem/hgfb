import { displayCurrency } from './holdings.js'

export const TF_CLEAR_NO_RIPPLE = 262144
export const ASF_DEFAULT_RIPPLE = 8
export const LSF_DEFAULT_RIPPLE = 0x00800000
const RATE_NEUTRAL = 1_000_000_000

export function effectiveTransferRate(rate) {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= RATE_NEUTRAL) return RATE_NEUTRAL
  return n
}

function trimAmount(n) {
  if (!(n > 0) || !Number.isFinite(n)) return '0'
  return n.toFixed(8).replace(/\.?0+$/, '')
}

export function sourceRequired(destinationAmount, transferRate) {
  const dest = Number(destinationAmount)
  if (!(dest > 0)) return '0'
  return trimAmount(dest * effectiveTransferRate(transferRate) / RATE_NEUTRAL)
}

export function maxDeliverable(balance, transferRate) {
  const bal = Number(balance)
  if (!(bal > 0)) return '0'
  return trimAmount(bal * RATE_NEUTRAL / effectiveTransferRate(transferRate))
}

export function lineRoom(line) {
  if (!line) return 0
  const room = Number(line.limit) - Number(line.balance)
  return Number.isFinite(room) ? room : 0
}

export function hasDefaultRipple(flags) {
  return (Number(flags) & LSF_DEFAULT_RIPPLE) !== 0
}

export function lineMatchesCurrency(line, code) {
  if (!line || !code) return false
  return line.currency === code || displayCurrency(line.currency) === code
}

export function findCurrencyLine(lines, code) {
  return (lines || []).find(line => lineMatchesCurrency(line, code)) || null
}

export function linesBlockingRipple(lines) {
  return (lines || []).filter(line => line && line.no_ripple && line.currency && line.account)
}

function lineIsFrozen(line) {
  return Boolean(line?.freeze || line?.freeze_peer)
}

export function buildClearNoRipple({ account, currency, counterparty, limit = '0' }) {
  return {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: {
      currency,
      issuer: counterparty,
      value: String(limit),
    },
    Flags: TF_CLEAR_NO_RIPPLE,
  }
}

export function planIssuedSend({
  amount,
  senderIsIssuer,
  senderBalance = '0',
  destHasLine,
  destRoom = 0,
  transferRate = 0,
  issuerNoRipple = false,
  frozen = false,
}) {
  const requested = Number(amount)
  if (!(requested > 0)) {
    return { ok: false, code: 'tecPATH_DRY', message: 'Enter an amount that actually moves.' }
  }
  if (!destHasLine) {
    return {
      ok: false,
      code: 'tecPATH_DRY',
      message: 'The receiver has no trust line for this asset. They need to open one before they can receive it.',
    }
  }
  if (frozen) {
    return { ok: false, code: 'tecPATH_DRY', message: 'This trust line is frozen, so the payment cannot move.' }
  }
  if (!senderIsIssuer && issuerNoRipple) {
    return {
      ok: false,
      code: 'tecPATH_DRY',
      message: 'The issuer still has No Ripple on these lines, so holders cannot pay each other. On Issue, use Enable rippling on existing lines.',
    }
  }
  if (!(destRoom > 0)) {
    return {
      ok: false,
      code: 'tecPATH_PARTIAL',
      message: 'The receiver’s trust line has no room left. They need a higher limit before this amount can land.',
    }
  }

  let deliver = requested
  if (!senderIsIssuer) {
    const balance = Number(senderBalance)
    if (!(balance > 0)) {
      return { ok: false, code: 'tecPATH_DRY', message: 'You do not hold any of this asset on this rail.' }
    }
    const affordable = Number(maxDeliverable(balance, transferRate))
    if (deliver > affordable) deliver = affordable
  }
  if (deliver > destRoom) deliver = destRoom
  if (!(deliver > 0)) {
    return {
      ok: false,
      code: 'tecPATH_PARTIAL',
      message: 'The full amount cannot be delivered, and a smaller amount would not clear either.',
    }
  }

  const fitted = trimAmount(deliver)
  const note = Number(fitted) + 1e-10 < requested
    ? `Sending ${fitted} so the payment can clear. ${amount} does not fit the balance, the issuer transfer fee, or the receiver’s remaining trust limit.`
    : ''
  return { ok: true, amount: fitted, note, code: note ? 'tecPATH_PARTIAL' : '' }
}

export function planFromLines({ amount, senderIsIssuer, senderLine, destLine, transferRate }) {
  return planIssuedSend({
    amount,
    senderIsIssuer,
    senderBalance: senderLine?.balance || '0',
    destHasLine: Boolean(destLine),
    destRoom: lineRoom(destLine),
    transferRate,
    issuerNoRipple: Boolean(senderLine?.no_ripple_peer || destLine?.no_ripple_peer),
    frozen: lineIsFrozen(senderLine) || lineIsFrozen(destLine),
  })
}

export function rippleRepairTransactions({ account, flags, lines }) {
  const repairs = []
  if (!hasDefaultRipple(flags)) {
    repairs.push({
      TransactionType: 'AccountSet',
      Account: account,
      SetFlag: ASF_DEFAULT_RIPPLE,
    })
  }
  for (const line of linesBlockingRipple(lines)) {
    repairs.push(buildClearNoRipple({
      account,
      currency: line.currency,
      counterparty: line.account,
      limit: line.limit || '0',
    }))
  }
  return repairs
}

export function rippleRepairNote(cleared) {
  if (!cleared) return 'Rippling is already on for every existing line. New lines follow Default rippling.'
  const lines = cleared === 1 ? 'line' : 'lines'
  return `Rippling is on for ${cleared} existing ${lines}. Holders can pay each other.`
}

export async function accountLines(client, account) {
  const lines = []
  let marker
  do {
    const request = { command: 'account_lines', account, ledger_index: 'validated', limit: 400 }
    if (marker) request.marker = marker
    const result = await client.request(request)
    lines.push(...(result.result.lines || []))
    marker = result.result.marker
  } while (marker && lines.length < 2000)
  return lines
}

export async function linesWithPeer(client, account, peer) {
  try {
    const result = await client.request({
      command: 'account_lines',
      account,
      peer,
      ledger_index: 'validated',
      limit: 400,
    })
    return result.result.lines || []
  } catch {
    const lines = await accountLines(client, account)
    return lines.filter(line => line.account === peer)
  }
}
