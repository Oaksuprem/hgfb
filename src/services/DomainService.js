/**
 * DomainService — pure builders for Permissioned Domain operations.
 */
import * as xrpl from 'xrpl'

function toHexIfNeeded(val) {
  if (!val) return val
  return /^[0-9A-Fa-f]+$/.test(val) && val.length % 2 === 0
    ? val
    : xrpl.convertStringToHex(val)
}

export function buildSetDomain({ account, acceptedCredentials }) {
  const tx = { TransactionType: 'PermissionedDomainSet', Account: account }
  if (acceptedCredentials) tx.AcceptedCredentials = acceptedCredentials
  return tx
}

export function buildDeleteDomain({ account, domainID }) {
  const tx = { TransactionType: 'PermissionedDomainDelete', Account: account }
  if (domainID) tx.DomainID = domainID
  return tx
}

export async function queryDomains(account, client) {
  const r = await client.request({ command: 'account_objects', account, type: 'permissioned_domain', ledger_index: 'validated' })
  return r.result.account_objects ?? []
}
