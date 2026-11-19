import assert from 'node:assert/strict'
import test from 'node:test'
import * as xrpl from 'xrpl'
import { mptPresets, nftPresets } from '../src/lib/productPresets.js'
import { ASF_DEFAULT_RIPPLE, LSF_DEFAULT_RIPPLE, TF_CLEAR_NO_RIPPLE } from '../src/lib/pathfix.js'
import { LSF_ACCEPTED } from '../src/lib/credentials.js'
import {
  ACCOUNT_SET_FLAGS,
  MPT_LOCK_FLAG,
  MPT_UNLOCK_FLAG,
  SELL_NFT_FLAG,
  TF_PARTIAL_PAYMENT,
  TF_SET_AUTH,
  confidentialIssuanceFlags,
  mptImmutableFlags,
  mptIssuanceFlags,
  nftMintFlags,
  offerCreateFlags,
} from '../src/lib/txFlags.js'
import { rippleExpiration } from '../src/lib/time.js'
import { buildAuthorizeMPT, buildCreateMPT, buildCreateNFTOffer, buildMintNFT } from '../src/services/TokenService.js'
import { buildCreateOffer } from '../src/services/DexService.js'

const {
  NFTokenMintFlags: NFT,
  MPTokenIssuanceCreateFlags: MPT,
  MPTokenIssuanceCreateImmutableFlags: IMM,
  MPTokenIssuanceSetFlags: SET,
  NFTokenCreateOfferFlags: OFFER_NFT,
  OfferCreateFlags: OFFER,
  PaymentFlags: PAY,
  TrustSetFlags: TRUST,
  AccountSetAsfFlags: ASF,
  AccountSetTfFlags: ATF,
} = xrpl

function mintPreset(preset) {
  return nftMintFlags({
    burnable: preset.burnable,
    onlyXrp: preset.onlyXrp,
    transferable: preset.transferable,
    mutable: preset.mutableUri,
  })
}

test('NFT mint flags match the xrpl enum, including the product presets', () => {
  assert.equal(NFT.tfBurnable, 1)
  assert.equal(NFT.tfOnlyXRP, 2)
  assert.equal(NFT.tfTransferable, 8)
  assert.equal(NFT.tfMutable, 16)
  assert.equal(nftMintFlags({ burnable: true, onlyXrp: true, transferable: true, mutable: true }), 1 | 2 | 8 | 16)
  assert.equal(mintPreset(nftPresets.policy), NFT.tfBurnable)
  assert.equal(mintPreset(nftPresets.claim), NFT.tfBurnable | NFT.tfMutable)
  assert.equal(mintPreset(nftPresets.claim) & NFT.tfTransferable, 0)
  assert.equal(mintPreset(nftPresets.property), NFT.tfBurnable | NFT.tfTransferable)
  assert.equal(SELL_NFT_FLAG, OFFER_NFT.tfSellNFToken)
  assert.equal(SELL_NFT_FLAG, 1)

  const minter = xrpl.Wallet.generate()
  const tx = buildMintNFT({
    account: minter.address,
    taxon: 7,
    flags: { burnable: true, onlyXRP: true, transferable: true, mutable: true },
  })
  const signed = minter.sign({ ...tx, Fee: '12', Sequence: 1 })
  assert.equal(xrpl.decode(signed.tx_blob).Flags, NFT.tfBurnable | NFT.tfOnlyXRP | NFT.tfTransferable | NFT.tfMutable)
})

test('MPT issuance flags match the xrpl enum, including confidential and the product presets', () => {
  assert.equal(MPT.tfMPTCanLock, 2)
  assert.equal(MPT.tfMPTRequireAuth, 4)
  assert.equal(MPT.tfMPTCanEscrow, 8)
  assert.equal(MPT.tfMPTCanTrade, 16)
  assert.equal(MPT.tfMPTCanTransfer, 32)
  assert.equal(MPT.tfMPTCanClawback, 64)
  assert.equal(MPT.tfMPTCanHoldConfidentialBalance, 128)
  assert.equal(mptIssuanceFlags({
    canLock: true, requireAuth: true, canEscrow: true, canTrade: true, canTransfer: true, canClawback: true,
  }), 2 | 4 | 8 | 16 | 32 | 64)

  const cover = mptIssuanceFlags(mptPresets.cover)
  assert.equal(cover, MPT.tfMPTCanLock | MPT.tfMPTRequireAuth)
  assert.equal(cover & MPT.tfMPTCanTransfer, 0)
  assert.equal(cover & MPT.tfMPTCanTrade, 0)
  const coverLocked = mptImmutableFlags(mptPresets.cover.immutable)
  assert.equal(coverLocked, IMM.tifMPTRequireAuth | IMM.tifMPTMetadata)

  const shares = mptIssuanceFlags(mptPresets.building)
  assert.equal(shares, MPT.tfMPTRequireAuth | MPT.tfMPTCanTransfer | MPT.tfMPTCanClawback)
  const sharesLocked = mptImmutableFlags(mptPresets.building.immutable)
  assert.equal(sharesLocked, IMM.tifMPTRequireAuth | IMM.tifMPTCanTransfer)
  assert.equal(sharesLocked & IMM.tifMPTCanClawback, 0)

  assert.equal(IMM.tifMPTMetadata, 0x10000)
  assert.equal(IMM.tifMPTTransferFee, 0x20000)
  assert.equal(MPT_LOCK_FLAG, SET.tfMPTLock)
  assert.equal(MPT_UNLOCK_FLAG, SET.tfMPTUnlock)
  assert.equal(MPT_LOCK_FLAG, 1)
  assert.equal(MPT_UNLOCK_FLAG, 2)

  const confidential = confidentialIssuanceFlags({ canTransfer: true, canClawback: true, canLock: true })
  assert.equal(confidential & MPT.tfMPTCanHoldConfidentialBalance, MPT.tfMPTCanHoldConfidentialBalance)
  assert.equal(confidential & MPT.tfMPTCanTransfer, MPT.tfMPTCanTransfer)
  assert.equal(confidential & MPT.tfMPTCanClawback, MPT.tfMPTCanClawback)
  assert.equal(confidential & MPT.tfMPTCanLock, MPT.tfMPTCanLock)
  assert.equal(confidential & MPT.tfMPTCanEscrow, 0)
  assert.equal(confidential & MPT.tfMPTCanTrade, 0)
  assert.notEqual(MPT.tfMPTCanHoldConfidentialBalance, 0x20)
  assert.notEqual(MPT.tfMPTCanTransfer, 0x08)
  assert.notEqual(MPT.tfMPTCanClawback, 0x10)

  const issuer = xrpl.Wallet.generate()
  const created = buildCreateMPT({
    account: issuer.address,
    flags: { canTransfer: true, canClawback: true },
    immutableFlags: { metadata: true },
    assetScale: 0,
  })
  const signed = issuer.sign({ ...created, Fee: '12', Sequence: 1 })
  const decoded = xrpl.decode(signed.tx_blob)
  assert.equal(decoded.Flags, MPT.tfMPTCanTransfer | MPT.tfMPTCanClawback)
  assert.equal(decoded.ImmutableFlags, IMM.tifMPTMetadata)
})

test('a confidential opt-in is signed by the holder and does not set Holder', () => {
  const holder = xrpl.Wallet.generate()
  const tx = buildAuthorizeMPT({ account: holder.address, mptIssuanceID: 'A'.repeat(48) })
  assert.equal(tx.TransactionType, 'MPTokenAuthorize')
  assert.equal(tx.Account, holder.address)
  assert.equal(tx.Holder, undefined)
  const signed = holder.sign({ ...tx, Fee: '12', Sequence: 1 })
  const decoded = xrpl.decode(signed.tx_blob)
  assert.equal(decoded.Account, holder.address)
  assert.equal(decoded.Holder, undefined)
})

test('offer flags match the xrpl enum and hybrid is not the old 0x00200000 bit', () => {
  assert.equal(OFFER.tfPassive, 0x00010000)
  assert.equal(OFFER.tfImmediateOrCancel, 0x00020000)
  assert.equal(OFFER.tfFillOrKill, 0x00040000)
  assert.equal(OFFER.tfSell, 0x00080000)
  assert.equal(OFFER.tfHybrid, 0x00100000)
  assert.notEqual(OFFER.tfHybrid, 0x00200000)
  assert.equal(offerCreateFlags({ passive: true, sell: true, hybrid: true }), OFFER.tfPassive | OFFER.tfSell | OFFER.tfHybrid)
  assert.throws(() => offerCreateFlags({ immediateOrCancel: true, fillOrKill: true }), /Fill or Kill/)

  const trader = xrpl.Wallet.generate()
  const tx = buildCreateOffer({
    account: trader.address,
    takerGets: '1000000',
    takerPays: '1000000',
    domainID: 'AB'.repeat(32),
    flags: { hybrid: true },
  })
  assert.equal(tx.Flags, OFFER.tfHybrid)
  const signed = trader.sign({ ...tx, Fee: '12', Sequence: 1 })
  assert.equal(xrpl.decode(signed.tx_blob).Flags, OFFER.tfHybrid)

  const day = '2027-06-15'
  const dated = buildCreateOffer({
    account: trader.address,
    takerGets: '1000000',
    takerPays: '1000000',
    expiration: day,
  })
  assert.equal(dated.Expiration, rippleExpiration(day))
  assert.throws(() => buildCreateOffer({
    account: trader.address,
    takerGets: '1000000',
    takerPays: '1000000',
    expiration: '2020-01-01',
  }), /past/)
  const sell = buildCreateNFTOffer({
    account: trader.address,
    nftokenID: '00'.repeat(32),
    amount: '0',
    isSellOffer: true,
    expiration: day,
  })
  assert.equal(sell.Flags, OFFER_NFT.tfSellNFToken)
  assert.equal(sell.Expiration, rippleExpiration(day))
})

test('account, payment, and trust flags match the xrpl enums', () => {
  assert.equal(ACCOUNT_SET_FLAGS.asfRequireDestTag.value, ASF.asfRequireDest)
  assert.equal(ACCOUNT_SET_FLAGS.asfRequireDestTag.tfSet, ATF.tfRequireDestTag)
  assert.equal(ACCOUNT_SET_FLAGS.asfRequireDestTag.tfClear, ATF.tfOptionalDestTag)
  assert.equal(ACCOUNT_SET_FLAGS.asfRequireAuth.value, ASF.asfRequireAuth)
  assert.equal(ACCOUNT_SET_FLAGS.asfRequireAuth.tfSet, ATF.tfRequireAuth)
  assert.equal(ACCOUNT_SET_FLAGS.asfRequireAuth.tfClear, ATF.tfOptionalAuth)
  assert.equal(ACCOUNT_SET_FLAGS.asfDisallowXRP.value, ASF.asfDisallowXRP)
  assert.equal(ACCOUNT_SET_FLAGS.asfDisallowXRP.tfSet, ATF.tfDisallowXRP)
  assert.equal(ACCOUNT_SET_FLAGS.asfDisallowXRP.tfClear, ATF.tfAllowXRP)
  assert.equal(ACCOUNT_SET_FLAGS.asfDefaultRipple.value, ASF.asfDefaultRipple)
  assert.equal(ASF_DEFAULT_RIPPLE, ASF.asfDefaultRipple)
  assert.equal(ACCOUNT_SET_FLAGS.asfAllowTrustLineLocking.value, ASF.asfAllowTrustLineLocking)
  for (const spec of Object.values(ACCOUNT_SET_FLAGS)) {
    assert.equal(Object.values(ASF).includes(spec.value), true)
  }

  assert.equal(TF_PARTIAL_PAYMENT, PAY.tfPartialPayment)
  assert.equal(TF_PARTIAL_PAYMENT, 0x00020000)
  assert.equal(TF_SET_AUTH, TRUST.tfSetfAuth)
  assert.equal(TF_CLEAR_NO_RIPPLE, TRUST.tfClearNoRipple)
  assert.equal(TF_CLEAR_NO_RIPPLE, 0x00040000)
  assert.equal(xrpl.parseAccountRootFlags(LSF_DEFAULT_RIPPLE).lsfDefaultRipple, true)
  assert.equal(LSF_ACCEPTED, 0x00010000)
})
