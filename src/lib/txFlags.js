import {
  AccountSetAsfFlags,
  AccountSetTfFlags,
  MPTokenIssuanceCreateFlags,
  MPTokenIssuanceCreateImmutableFlags,
  MPTokenIssuanceSetFlags,
  NFTokenCreateOfferFlags,
  NFTokenMintFlags,
  OfferCreateFlags,
  PaymentFlags,
  TrustSetFlags,
} from 'xrpl'

export function nftMintFlags({ burnable = false, onlyXrp = false, onlyXRP = false, transferable = false, mutable = false } = {}) {
  let flags = 0
  if (burnable) flags |= NFTokenMintFlags.tfBurnable
  if (onlyXrp || onlyXRP) flags |= NFTokenMintFlags.tfOnlyXRP
  if (transferable) flags |= NFTokenMintFlags.tfTransferable
  if (mutable) flags |= NFTokenMintFlags.tfMutable
  return flags
}

export function mptIssuanceFlags({ canLock = false, requireAuth = false, canEscrow = false, canTrade = false, canTransfer = false, canClawback = false } = {}) {
  const F = MPTokenIssuanceCreateFlags
  let flags = 0
  if (canLock) flags |= F.tfMPTCanLock
  if (requireAuth) flags |= F.tfMPTRequireAuth
  if (canEscrow) flags |= F.tfMPTCanEscrow
  if (canTrade) flags |= F.tfMPTCanTrade
  if (canTransfer) flags |= F.tfMPTCanTransfer
  if (canClawback) flags |= F.tfMPTCanClawback
  return flags
}

export function mptImmutableFlags({ canLock = false, requireAuth = false, canEscrow = false, canTrade = false, canTransfer = false, canClawback = false, metadata = false, transferFee = false } = {}) {
  const F = MPTokenIssuanceCreateImmutableFlags
  let flags = 0
  if (canLock) flags |= F.tifMPTCanLock
  if (requireAuth) flags |= F.tifMPTRequireAuth
  if (canEscrow) flags |= F.tifMPTCanEscrow
  if (canTrade) flags |= F.tifMPTCanTrade
  if (canTransfer) flags |= F.tifMPTCanTransfer
  if (canClawback) flags |= F.tifMPTCanClawback
  if (metadata) flags |= F.tifMPTMetadata
  if (transferFee) flags |= F.tifMPTTransferFee
  return flags
}

/** Confidential issuance always sets the enum bit. Transfer and clawback stay their own bits. */
export function confidentialIssuanceFlags({ canTransfer = false, canClawback = false, canLock = false } = {}) {
  const F = MPTokenIssuanceCreateFlags
  let flags = F.tfMPTCanHoldConfidentialBalance
  if (canTransfer) flags |= F.tfMPTCanTransfer
  if (canClawback) flags |= F.tfMPTCanClawback
  if (canLock) flags |= F.tfMPTCanLock
  return flags
}

export function offerCreateFlags({ passive = false, immediateOrCancel = false, fillOrKill = false, sell = false, hybrid = false } = {}) {
  if (immediateOrCancel && fillOrKill) {
    throw new Error('Immediate or Cancel and Fill or Kill cannot be set on the same order.')
  }
  const F = OfferCreateFlags
  let flags = 0
  if (passive) flags |= F.tfPassive
  if (immediateOrCancel) flags |= F.tfImmediateOrCancel
  if (fillOrKill) flags |= F.tfFillOrKill
  if (sell) flags |= F.tfSell
  if (hybrid) flags |= F.tfHybrid
  return flags
}

export const SELL_NFT_FLAG = NFTokenCreateOfferFlags.tfSellNFToken
export const MPT_LOCK_FLAG = MPTokenIssuanceSetFlags.tfMPTLock
export const MPT_UNLOCK_FLAG = MPTokenIssuanceSetFlags.tfMPTUnlock
export const TF_SET_AUTH = TrustSetFlags.tfSetfAuth
export const TF_PARTIAL_PAYMENT = PaymentFlags.tfPartialPayment

export const ACCOUNT_SET_FLAGS = {
  asfRequireDestTag: {
    value: AccountSetAsfFlags.asfRequireDest,
    tfSet: AccountSetTfFlags.tfRequireDestTag,
    tfClear: AccountSetTfFlags.tfOptionalDestTag,
  },
  asfRequireAuth: {
    value: AccountSetAsfFlags.asfRequireAuth,
    tfSet: AccountSetTfFlags.tfRequireAuth,
    tfClear: AccountSetTfFlags.tfOptionalAuth,
  },
  asfDisallowXRP: {
    value: AccountSetAsfFlags.asfDisallowXRP,
    tfSet: AccountSetTfFlags.tfDisallowXRP,
    tfClear: AccountSetTfFlags.tfAllowXRP,
  },
  asfDisableMaster: { value: AccountSetAsfFlags.asfDisableMaster },
  asfAccountTxnID: { value: AccountSetAsfFlags.asfAccountTxnID },
  asfNoFreeze: { value: AccountSetAsfFlags.asfNoFreeze },
  asfGlobalFreeze: { value: AccountSetAsfFlags.asfGlobalFreeze },
  asfDefaultRipple: { value: AccountSetAsfFlags.asfDefaultRipple },
  asfDepositAuth: { value: AccountSetAsfFlags.asfDepositAuth },
  asfDisallowIncomingNFTokenOffer: { value: AccountSetAsfFlags.asfDisallowIncomingNFTokenOffer },
  asfDisallowIncomingCheck: { value: AccountSetAsfFlags.asfDisallowIncomingCheck },
  asfDisallowIncomingPayChan: { value: AccountSetAsfFlags.asfDisallowIncomingPayChan },
  asfDisallowIncomingTrustline: { value: AccountSetAsfFlags.asfDisallowIncomingTrustline },
  asfAllowTrustLineClawback: { value: AccountSetAsfFlags.asfAllowTrustLineClawback },
  asfAllowTrustLineLocking: { value: AccountSetAsfFlags.asfAllowTrustLineLocking },
}
