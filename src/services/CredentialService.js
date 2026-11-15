/**
 * CredentialService — pure builders for Permissioned DEX credential operations.
 */
import * as xrpl from 'xrpl'
import { rippleExpiration } from '../lib/time'
export { LSF_ACCEPTED, acceptBlockReason } from '../lib/credentials'

export function buildCreateCredential({ account, subject, credentialType, expiration, uri }) {
  const tx = {
    TransactionType: 'CredentialCreate',
    Account: account,
    Subject: subject,
    CredentialType: xrpl.convertStringToHex(credentialType),
  }
  if (expiration) tx.Expiration = rippleExpiration(expiration)
  if (uri) tx.URI = xrpl.convertStringToHex(uri)
  return tx
}

export async function findCredential(client, { subject, issuer, credentialType }) {
  try {
    const r = await client.request({
      command: 'ledger_entry',
      credential: {
        subject,
        issuer,
        credential_type: xrpl.convertStringToHex(credentialType),
      },
      ledger_index: 'validated',
    })
    return r.result.node ?? null
  } catch (e) {
    if (e?.data?.error === 'entryNotFound') return null
    throw e
  }
}

export function buildAcceptCredential({ account, issuer, credentialType }) {
  return {
    TransactionType: 'CredentialAccept',
    Account: account,
    Issuer: issuer,
    CredentialType: xrpl.convertStringToHex(credentialType),
  }
}

export function buildDeleteCredential({ account, subject, issuer, credentialType }) {
  const tx = {
    TransactionType: 'CredentialDelete',
    Account: account,
    CredentialType: xrpl.convertStringToHex(credentialType),
  }
  if (subject) tx.Subject = subject
  if (issuer)  tx.Issuer  = issuer
  return tx
}

export async function queryCredentials(account, client) {
  const r = await client.request({ command: 'account_objects', account, type: 'credential', ledger_index: 'validated' })
  return r.result.account_objects ?? []
}
