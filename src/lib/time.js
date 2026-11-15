/** Seconds between the Unix epoch and the Ripple epoch (2000-01-01). */
export const RIPPLE_EPOCH_OFFSET = 946684800

/**
 * XRPL Expiration fields are seconds since the Ripple epoch.
 * A date-only value (YYYY-MM-DD) means the end of that local day.
 * A past time is refused so the ledger does not charge a fee for tecEXPIRED.
 */
export function rippleExpiration(value, now = new Date()) {
  if (!value) return null
  const text = String(value).trim()
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59`)
    : new Date(text)
  const ms = stamp.getTime()
  if (!Number.isFinite(ms)) {
    throw new Error('Expiration is not a valid date.')
  }
  if (ms <= now.getTime()) {
    throw new Error('Expiration is already in the past. Choose a later date.')
  }
  return Math.floor(ms / 1000) - RIPPLE_EPOCH_OFFSET
}
