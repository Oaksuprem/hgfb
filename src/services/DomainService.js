/**
 * DomainService — pure builders for Permissioned Domain operations.
 */
import * as xrpl from 'xrpl'
import { ledgerId } from '../lib/credit.js'

function toHexIfNeeded(val) {
  if (!val) return val
  return /^[0-9A-Fa-f]+$/.test(val) && val.length % 2 === 0
    ? val
    : xrpl.convertStringToHex(val)
}

export function buildCreditDomain({ account, issuer, credentialType, domainId }) {
  const type = String(credentialType ?? '').trim()
  if (!type) throw new Error('Credential type is required.')
  const encoded = xrpl.convertStringToHex(type)
  if (encoded.length / 2 > 64) throw new Error('Credential type is longer than 64 bytes.')
  const issuerAddress = String(issuer ?? '').trim()
  if (!xrpl.isValidClassicAddress(issuerAddress)) {
    throw new Error('Credential issuer must be a classic address.')
  }
  const holder = String(account ?? '').trim()
  if (!xrpl.isValidClassicAddress(holder)) throw new Error('Account must be a classic address.')
  const tx = buildSetDomain({
    account: holder,
    acceptedCredentials: [{
      Credential: {
        Issuer: issuerAddress,
        CredentialType: encoded,
      },
    }],
  })
  if (String(domainId ?? '').trim()) tx.DomainID = ledgerId(domainId, 'Domain ID')
  xrpl.validate(tx)
  return tx
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
