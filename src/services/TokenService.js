/**
 * TokenService — pure transaction builders for FT, NFT, and MPT operations.
 * All functions return plain transaction field objects (no side effects).
 * Pass the result to useTxBuilder.buildTransaction() then useTxSubmit.submitTransaction().
 */
import * as xrpl from 'xrpl'

const ASF_MAP = {
  asfRequireDestTag: 1, asfRequireAuth: 2, asfDisallowXRP: 3,
  asfDisableMaster: 4, asfAccountTxnID: 5, asfNoFreeze: 6,
  asfGlobalFreeze: 7, asfDefaultRipple: 8, asfDepositAuth: 9,
  asfAllowTrustLineClawback: 16,
}

// ── FT ────────────────────────────────────────────────────────────────────────

export function buildConfigureIssuer({ account, setFlag, clearFlag, transferRate, tickSize, domain, emailHash, messageKey }) {
  const tx = { TransactionType: 'AccountSet', Account: account }
  if (setFlag && setFlag !== 'none' && ASF_MAP[setFlag])   tx.SetFlag   = ASF_MAP[setFlag]
  if (clearFlag && clearFlag !== 'none' && ASF_MAP[clearFlag]) tx.ClearFlag = ASF_MAP[clearFlag]
  if (transferRate !== undefined)
    tx.TransferRate = Number(transferRate) === 0 ? 0 : Math.round(Number(transferRate) * 10_000_000 + 1_000_000_000)
  if (tickSize) tx.TickSize = Number(tickSize)
  if (domain)   tx.Domain   = xrpl.convertStringToHex(domain.toLowerCase())
  if (emailHash)  tx.EmailHash  = emailHash
  if (messageKey) tx.MessageKey = messageKey
  return tx
}

export function buildDistributeFungibleToken({ account, destination, currency, amount, partial, sendMax, deliverMin, destinationTag, memo }) {
  const cur = currency.toUpperCase()
  const tx  = {
    TransactionType: 'Payment',
    Account: account,
    Destination: destination,
    Amount: { currency: cur, issuer: account, value: String(amount) },
  }
  if (partial) {
    tx.Flags = 0x00020000
    if (sendMax)    tx.SendMax    = { currency: cur, issuer: account, value: String(sendMax) }
    if (deliverMin) tx.DeliverMin = { currency: cur, issuer: account, value: String(deliverMin) }
  }
  if (destinationTag) tx.DestinationTag = Number(destinationTag)
  if (memo) tx.Memos = [{ Memo: { MemoData: xrpl.convertStringToHex(memo) } }]
  return tx
}

export function buildAuthorizeTrustLine({ account, holderAddress, currency }) {
  return {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: { currency: currency.toUpperCase(), issuer: holderAddress, value: '0' },
    Flags: 0x00010000, // tfSetfAuth
  }
}

export function buildClawbackToken({ account, holderAddress, currency, amount }) {
  return {
    TransactionType: 'Clawback',
    Account: account,
    Amount: { currency: currency.toUpperCase(), issuer: holderAddress, value: String(amount) },
  }
}

// ── NFT ───────────────────────────────────────────────────────────────────────

export function buildMintNFT({ account, taxon, uri, transferFee, flags = {}, issuer }) {
  let f = 0
  if (flags.burnable)     f |= 0x00000001
  if (flags.onlyXRP)      f |= 0x00000002
  if (flags.transferable) f |= 0x00000008
  if (flags.mutable)      f |= 0x00000010
  const tx = { TransactionType: 'NFTokenMint', Account: account, NFTokenTaxon: Number(taxon), Flags: f }
  if (transferFee && Number(transferFee) > 0) tx.TransferFee = Math.round(Number(transferFee) * 1000)
  if (uri)    tx.URI    = xrpl.convertStringToHex(uri)
  if (issuer) tx.Issuer = issuer
  return tx
}

export function buildCreateNFTOffer({ account, nftokenID, amount, isSellOffer, destination, owner, expiration }) {
  const tx = { TransactionType: 'NFTokenCreateOffer', Account: account, NFTokenID: nftokenID, Amount: amount }
  if (isSellOffer) {
    tx.Flags = 1
    if (destination) tx.Destination = destination
  } else {
    if (!owner) throw new Error('Owner required for buy offers')
    tx.Owner = owner
  }
  if (expiration) tx.Expiration = Math.floor(new Date(expiration).getTime() / 1000) - 946684800
  return tx
}

export function buildAcceptNFTOffer({ account, sellOfferID, buyOfferID, brokerFee }) {
  const tx = { TransactionType: 'NFTokenAcceptOffer', Account: account }
  if (sellOfferID) tx.NFTokenSellOffer = sellOfferID
  if (buyOfferID)  tx.NFTokenBuyOffer  = buyOfferID
  if (brokerFee && sellOfferID && buyOfferID) tx.NFTokenBrokerFee = xrpl.xrpToDrops(brokerFee)
  return tx
}

export function buildCancelNFTOffer({ account, offerIDs }) {
  return { TransactionType: 'NFTokenCancelOffer', Account: account, NFTokenOffers: offerIDs }
}

export function buildBurnNFT({ account, nftokenID }) {
  return { TransactionType: 'NFTokenBurn', Account: account, NFTokenID: nftokenID }
}

// ── MPT ───────────────────────────────────────────────────────────────────────

export function buildCreateMPT({ account, maxAmount, assetScale, transferFee, metadata, flags = {}, immutableFlags = {} }) {
  let f = 0
  if (flags.canLock)     f |= 0x00000002
  if (flags.requireAuth) f |= 0x00000004
  if (flags.canEscrow)   f |= 0x00000008
  if (flags.canTrade)    f |= 0x00000010
  if (flags.canTransfer) f |= 0x00000020
  if (flags.canClawback) f |= 0x00000040

  let imm = 0
  if (immutableFlags.canLock)     imm |= 0x00000002
  if (immutableFlags.requireAuth) imm |= 0x00000004
  if (immutableFlags.canEscrow)   imm |= 0x00000008
  if (immutableFlags.canTrade)    imm |= 0x00000010
  if (immutableFlags.canTransfer) imm |= 0x00000020
  if (immutableFlags.canClawback) imm |= 0x00000040
  if (immutableFlags.metadata)    imm |= 0x00010000
  if (immutableFlags.transferFee) imm |= 0x00020000

  const tx = { TransactionType: 'MPTokenIssuanceCreate', Account: account, Flags: f, AssetScale: Number(assetScale ?? 0) }
  const tfRaw = Math.round(Number(transferFee ?? 0) * 1000)
  if (tfRaw > 0) tx.TransferFee = tfRaw
  if (maxAmount) tx.MaximumAmount = String(maxAmount)
  if (metadata) {
    tx.MPTokenMetadata = Array.from(new TextEncoder().encode(metadata))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  if (imm > 0) tx.ImmutableFlags = imm
  return tx
}

export function buildAuthorizeMPT({ account, mptIssuanceID, holderAddress }) {
  const tx = { TransactionType: 'MPTokenAuthorize', Account: account, MPTokenIssuanceID: mptIssuanceID }
  if (holderAddress) tx.Holder = holderAddress
  return tx
}

export function buildDistributeMPT({ account, destination, mptIssuanceID, amount, destinationTag, memo }) {
  const tx = {
    TransactionType: 'Payment',
    Account: account,
    Destination: destination,
    Amount: { mpt_issuance_id: mptIssuanceID, value: String(amount) },
  }
  if (destinationTag) tx.DestinationTag = Number(destinationTag)
  if (memo) tx.Memos = [{ Memo: { MemoData: xrpl.convertStringToHex(memo) } }]
  return tx
}

export function buildDestroyMPT({ account, mptIssuanceID }) {
  return { TransactionType: 'MPTokenIssuanceDestroy', Account: account, MPTokenIssuanceID: mptIssuanceID }
}

export function buildSetMPT({ account, mptIssuanceID, lock, holderAddress }) {
  const tx = {
    TransactionType: 'MPTokenIssuanceSet',
    Account: account,
    MPTokenIssuanceID: mptIssuanceID,
    Flags: lock ? 1 : 2,
  }
  if (holderAddress) tx.Holder = holderAddress
  return tx
}
