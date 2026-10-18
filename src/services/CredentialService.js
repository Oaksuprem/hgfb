/**
 * CredentialService — pure builders for Permissioned DEX credential operations.
 */
import * as xrpl from 'xrpl'

export function buildCreateCredential({ account, subject, credentialType, expiration, uri }) {
  const tx = {
    TransactionType: 'CredentialCreate',
    Account: account,
    Subject: subject,
    CredentialType: xrpl.convertStringToHex(credentialType),
  }
  if (expiration) tx.Expiration = Math.floor(new Date(expiration).getTime() / 1000) - 946684800
  if (uri) tx.URI = xrpl.convertStringToHex(uri)
  return tx
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
