export const LSF_ACCEPTED = 0x00010000

export function acceptBlockReason({ account, issuer, credentialType, exists, accepted }) {
  if (accepted) return 'This credential is already accepted.'
  if (exists) return ''
  if (account && issuer && account === issuer) {
    return 'No credential of this type is waiting on this account. The subject signs the accept. Open that account and enter the issuer that created the credential.'
  }
  return `No ${credentialType} credential from that issuer is waiting for this account.`
}
