import { AccountSetAsfFlags, TrustSetFlags } from 'xrpl'
import { displayCurrency } from './holdings.js'

export const TF_CLEAR_NO_RIPPLE = TrustSetFlags.tfClearNoRipple
export const ASF_DEFAULT_RIPPLE = AccountSetAsfFlags.asfDefaultRipple
export const LSF_DEFAULT_RIPPLE = 0x00800000
const RATE_NEUTRAL = 1_000_000_000

export function effectiveTransferRate(rate) {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= RATE_NEUTRAL) return RATE_NEUTRAL
  return n
}

export function floorAmount(value) {
  const n = Number(value)
  if (!(n > 0) || !Number.isFinite(n)) return '0'
  const decimals = n >= 1e7 ? 6 : 8
  const factor = 10 ** decimals
  const units = Math.floor(n * factor + 1e-9)
  if (units <= 0) return '0'
  const whole = Math.floor(units / factor)
  const frac = units - whole * factor
  if (!frac) return String(whole)
  return `${whole}.${String(frac).padStart(decimals, '0').replace(/0+$/, '')}`
}

export function ceilAmount(value) {
  const n = Number(value)
  if (!(n > 0) || !Number.isFinite(n)) return '0'
  const decimals = n >= 1e7 ? 6 : 8
  const factor = 10 ** decimals
  const units = Math.ceil(n * factor - 1e-9)
  if (units <= 0) return '0'
  const whole = Math.floor(units / factor)
  const frac = units - whole * factor
  if (!frac) return String(whole)
  return `${whole}.${String(frac).padStart(decimals, '0').replace(/0+$/, '')}`
}

export function paymentSendMax({ amount, transferRate, senderIsIssuer, balance, sourceAmount }) {
  if (senderIsIssuer) return null
  const rate = effectiveTransferRate(transferRate)
  let needed = null
  if (rate !== RATE_NEUTRAL) needed = ceilAmount(Number(amount) * rate / RATE_NEUTRAL)
  if (sourceAmount && Number(sourceAmount) > Number(needed || 0)) needed = ceilAmount(sourceAmount)
  if (!needed || needed === '0') return null
  if (balance != null && Number(needed) > Number(balance)) {
    const capped = floorAmount(balance)
    if (!(Number(capped) > 0)) return null
    if (Number(needed) - Number(capped) > Math.max(Number(capped) * 1e-6, 1e-6)) return null
    return capped
  }
  return needed
}

export function sourceRequired(destinationAmount, transferRate) {
  const dest = Number(destinationAmount)
  if (!(dest > 0)) return '0'
  return String(dest * effectiveTransferRate(transferRate) / RATE_NEUTRAL)
}

export function maxDeliverable(balance, transferRate) {
  const bal = Number(balance)
  const rate = effectiveTransferRate(transferRate)
  if (!(bal > 0)) return '0'
  if (rate === RATE_NEUTRAL) return floorAmount(bal)
  let deliver = bal * RATE_NEUTRAL / rate
  for (let step = 0; step < 8 && deliver > 0; step++) {
    const candidate = floorAmount(deliver)
    const cost = Number(candidate) * rate / RATE_NEUTRAL
    if (Number(candidate) > 0 && cost <= bal) return candidate
    deliver = Number(candidate) * (bal / cost) * 0.999999
  }
  return '0'
}

export function amountNote(requested, sending) {
  if (!(Number(sending) + 1e-10 < Number(requested))) return ''
  return `Sending ${sending} so the payment can clear. ${requested} is more than the balance, the issuer transfer fee, or the receiver’s remaining trust limit can deliver.`
}

export function lineRoom(line) {
  if (!line) return 0
  const room = Number(line.limit) - Number(line.balance)
  return Number.isFinite(room) ? room : 0
}

export function hasDefaultRipple(flags) {
  return (Number(flags) & LSF_DEFAULT_RIPPLE) !== 0
}

export function keepDefaultRipple(setNames = [], clearNames = []) {
  const setFlags = setNames.includes('asfDefaultRipple') ? [...setNames] : ['asfDefaultRipple', ...setNames]
  const clearFlags = clearNames.filter(name => name !== 'asfDefaultRipple')
  return { setFlags, clearFlags }
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

  const fitted = floorAmount(deliver)
  const note = amountNote(amount, fitted)
  return { ok: true, amount: fitted, note, code: note ? 'tecPATH_PARTIAL' : '' }
}

export async function clearingAmount(client, { source, destination, currency, issuer, amount }) {
  const requested = String(amount)
  const ask = async (value) => {
    if (!(Number(value) > 0)) return { ok: false }
    try {
      const result = await client.request({
        command: 'ripple_path_find',
        source_account: source,
        destination_account: destination,
        destination_amount: { currency, issuer, value: String(value) },
        source_currencies: [{ currency, issuer }],
        ledger_index: 'validated',
      })
      const alt = (result.result.alternatives || [])[0]
      if (!alt) return { ok: false }
      const src = alt.source_amount
      return { ok: true, source: src && typeof src === 'object' ? src.value : null }
    } catch {
      return { ok: null }
    }
  }

  const full = await ask(requested)
  if (full.ok === null) return { amount: requested, checked: false }
  if (full.ok) return { amount: requested, checked: true, sourceAmount: full.source }

  let best = '0'
  let bestSource = null
  let lo = 0
  let hi = Number(requested)
  for (let step = 0; step < 12 && hi - lo > Math.max(hi * 1e-8, 1e-8); step++) {
    const mid = floorAmount((lo + hi) / 2)
    if (!(Number(mid) > lo)) break
    const probe = await ask(mid)
    if (probe.ok === null) return { amount: requested, checked: false }
    if (probe.ok) {
      best = mid
      bestSource = probe.source
      lo = Number(mid)
    } else {
      hi = Number(mid)
    }
  }
  return { amount: best, checked: true, sourceAmount: bestSource }
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
