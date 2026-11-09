export function amountOf(xrpl, token, value) {
  if (!token || token.code === 'XRP') return xrpl.xrpToDrops(value)
  return { currency: token.code, issuer: token.issuer, value: String(value) }
}

export function trustLimit(token, limit) {
  return { currency: token.code, issuer: token.issuer, value: String(limit) }
}
