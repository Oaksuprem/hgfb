import directory from '../data/tokens.json'

function rowsFor(network) {
  const rows = network === 'mainnet'
    ? directory.mainnet
    : (directory.test || directory.devnet || directory.testnet)
  return (rows || []).filter(row => row && row.code && row.code !== 'XRP' && row.issuer)
}

export function listTokens(network, { allowXrp = true } = {}) {
  const issued = rowsFor(network).map(row => ({
    id: `${row.code}:${row.issuer}`,
    code: row.code,
    issuer: row.issuer,
    name: row.name || row.code,
    label: row.name ? `${row.code} · ${row.name}` : row.code,
  }))
  if (!allowXrp) return issued
  return [
    { id: 'XRP', code: 'XRP', issuer: '', name: 'XRP', label: 'XRP' },
    ...issued,
  ]
}

export function tokenById(network, id, options) {
  const list = listTokens(network, options)
  return list.find(token => token.id === id) || list[0] || null
}

export function defaultTokenId(network, options) {
  return tokenById(network, '', options)?.id || ''
}

export function amountOf(xrpl, token, value) {
  if (!token || token.code === 'XRP') return xrpl.xrpToDrops(value)
  return { currency: token.code, issuer: token.issuer, value: String(value) }
}
