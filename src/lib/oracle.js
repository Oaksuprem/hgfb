const UINT64_MAX = (1n << 64n) - 1n
export const UNIX_EPOCH_OFFSET = 946684800
/** Ledger close accepts LastUpdateTime only inside this many seconds. */
export const ORACLE_LEDGER_WINDOW = 300

export function oracleUpdateTime({ now = Math.floor(Date.now() / 1000), previous = 0, ledgerTime } = {}) {
  const clock = Number(now)
  const prior = Number(previous) || 0
  const ledger = ledgerTime == null ? Math.floor(Date.now() / 1000) : Number(ledgerTime)
  if (!Number.isFinite(clock) || !Number.isFinite(ledger) || clock < UNIX_EPOCH_OFFSET) {
    throw new Error('Oracle time must be a Unix timestamp within five minutes of the ledger.')
  }
  const next = Math.max(clock, prior + 1)
  if (next - ledger > ORACLE_LEDGER_WINDOW || ledger - next > ORACLE_LEDGER_WINDOW) {
    throw new Error('Oracle time must be a Unix timestamp within five minutes of the ledger.')
  }
  return next
}

const ISO_ASSET = /^[A-Z0-9a-z?!@#$%^&*(){}[\]|]{3}$/
const HEX_ASSET = /^[A-F0-9]{40}$/i

export function oracleAssetCode(raw) {
  const text = String(raw ?? '').trim()
  if (ISO_ASSET.test(text)) return text.toUpperCase()
  if (HEX_ASSET.test(text)) return text.toUpperCase()
  const bytes = new TextEncoder().encode(text)
  if (!text || bytes.length > 20) {
    throw new Error('Asset code must be a 3-character code such as XRP or USD.')
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase().padEnd(40, '0')
}

function scaleOf(scale) {
  const n = Number(scale)
  if (!Number.isInteger(n) || n < 0 || n > 10) {
    throw new Error('Scale must be a whole number from 0 to 10.')
  }
  return n
}

export function assetPriceUnits(raw, scale) {
  const text = String(raw ?? '').trim()
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text)
  if (!match) {
    throw new Error('Asset price must be a number, such as 2.45 or 6543210.')
  }
  const [, whole, frac] = match
  const places = scaleOf(scale)
  if (frac == null) return BigInt(whole)
  const digits = (frac + '0'.repeat(places)).slice(0, places)
  let units = BigInt(whole) * (10n ** BigInt(places)) + BigInt(digits || '0')
  if (frac[places] >= '5') units += 1n
  if (units > UINT64_MAX) throw new Error('Asset price is outside the oracle range.')
  return units
}

export function assetPriceValue(raw, scale) {
  const units = assetPriceUnits(raw, scale)
  if (units <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(units)
  let hex = units.toString(16).toUpperCase()
  if (hex.length % 2) hex = `0${hex}`
  return hex
}

export function assetPriceHuman(raw, scale) {
  const units = assetPriceUnits(raw, scale)
  const places = scaleOf(scale)
  const text = units.toString().padStart(places + 1, '0')
  const whole = text.slice(0, text.length - places) || '0'
  const frac = places ? text.slice(-places).replace(/0+$/, '') : ''
  return frac ? `${whole}.${frac}` : whole
}
