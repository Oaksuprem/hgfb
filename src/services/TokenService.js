/**
 * TokenService — pure transaction builders for FT, NFT, and MPT operations.
 * All functions return plain transaction field objects (no side effects).
 * Callers submit the returned fields with the connected wallet.
 */
import * as xrpl from 'xrpl'
import { rippleExpiration } from '../lib/time.js'
import {
  ACCOUNT_SET_FLAGS,
  MPT_LOCK_FLAG,
  MPT_UNLOCK_FLAG,
  SELL_NFT_FLAG,
  TF_PARTIAL_PAYMENT,
  TF_SET_AUTH,
  mptImmutableFlags,
  mptIssuanceFlags,
  nftMintFlags,
} from '../lib/txFlags.js'

const ASF_MAP = Object.fromEntries(
  Object.entries(ACCOUNT_SET_FLAGS).map(([name, spec]) => [name, spec.value]),
)

function accountSetFlag(name) {
  if (!name || name === 'none') return null
  if (!Object.prototype.hasOwnProperty.call(ASF_MAP, name)) {
    throw new Error(`Unknown AccountSet flag: ${name}`)
  }
  return ASF_MAP[name]
}

// ── FT ────────────────────────────────────────────────────────────────────────

export function buildConfigureIssuer({ account, setFlag, clearFlag, transferRate, tickSize, domain, emailHash, messageKey }) {
  const tx = { TransactionType: 'AccountSet', Account: account }
  const setValue = accountSetFlag(setFlag)
  const clearValue = accountSetFlag(clearFlag)
  if (setValue != null && setValue === clearValue) {
    throw new Error('An AccountSet flag cannot be set and cleared in the same transaction.')
  }
  if (setValue != null) tx.SetFlag = setValue
  if (clearValue != null) tx.ClearFlag = clearValue
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
    tx.Flags = TF_PARTIAL_PAYMENT
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
    Flags: TF_SET_AUTH,
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
  const f = nftMintFlags(flags)
  const tx = { TransactionType: 'NFTokenMint', Account: account, NFTokenTaxon: Number(taxon), Flags: f }
  if (transferFee && Number(transferFee) > 0) tx.TransferFee = Math.round(Number(transferFee) * 1000)
  if (uri)    tx.URI    = xrpl.convertStringToHex(uri)
  if (issuer) tx.Issuer = issuer
  return tx
}

export function buildCreateNFTOffer({ account, nftokenID, amount, isSellOffer, destination, owner, expiration }) {
  const tx = { TransactionType: 'NFTokenCreateOffer', Account: account, NFTokenID: nftokenID, Amount: amount }
  if (isSellOffer) {
    tx.Flags = SELL_NFT_FLAG
    if (destination) tx.Destination = destination
  } else {
    if (!owner) throw new Error('Owner required for buy offers')
    tx.Owner = owner
  }
  if (expiration) tx.Expiration = rippleExpiration(expiration)
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
  const f = mptIssuanceFlags(flags)
  const imm = mptImmutableFlags(immutableFlags)

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
    Flags: lock ? MPT_LOCK_FLAG : MPT_UNLOCK_FLAG,
  }
  if (holderAddress) tx.Holder = holderAddress
  return tx
}
