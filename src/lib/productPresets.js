/** Issuer-desk presets. Applying one fills the form. It does not submit. */

export const nftPresets = {
  policy: {
    id: 'policy',
    label: 'Policy certificate',
    burnable: true,
    onlyXrp: false,
    transferable: false,
    mutableUri: false,
    transferFee: '0',
    note: 'This NFT is one policy certificate. It is not the premium and it does not move money. Leave it non-transferable for a personal line. The URI is a link or hash of the schedule, not the customer’s identity. Taxon is the product line and stays as you set it. Burn the token when the policy lapses, is cancelled, or is fully settled.',
  },
  claim: {
    id: 'claim',
    label: 'Claim file',
    burnable: true,
    onlyXrp: false,
    transferable: false,
    mutableUri: true,
    transferFee: '0',
    note: 'This NFT is the claim file, not the indemnity. The payout is a separate issued-currency payment. The URI is marked mutable so the file can grow, but this desk does not yet send NFTokenModify, so an update cannot be written on-ledger from here.',
  },
  property: {
    id: 'property',
    label: 'Property certificate',
    burnable: true,
    onlyXrp: false,
    transferable: true,
    mutableUri: false,
    transferFee: '0',
    note: 'This NFT is the bank or trustee certificate for one whole property. It is not the government title. Completion is an NFT sell offer with Destination set to the named buyer. Rent and the purchase price stay issued-currency payments; this form does not send them.',
  },
}

export const mptPresets = {
  cover: {
    id: 'cover',
    label: 'Cover units',
    assetScale: '0',
    canLock: true,
    requireAuth: true,
    canEscrow: false,
    canTrade: false,
    canTransfer: false,
    canClawback: false,
    immutable: {
      canLock: false,
      requireAuth: true,
      canEscrow: false,
      canTrade: false,
      canTransfer: false,
      canClawback: false,
      metadata: true,
      transferFee: false,
    },
    metadata: `{
  "product": "cover-units",
  "peril": "",
  "attachment": "",
  "exhaustion": "",
  "inception": "",
  "expiry": ""
}`,
    note: 'These are identical units of capacity, not the premium. Premium is paid in an issued currency. Only authorized holders can receive units, and they cannot transfer or trade them. Lock is available for a loss-event freeze. A reinsurer’s private line belongs on the Confidential desk, where the transfer fee must stay zero.',
  },
  building: {
    id: 'building',
    label: 'Building shares',
    assetScale: '0',
    canLock: false,
    requireAuth: true,
    canEscrow: false,
    canTrade: false,
    canTransfer: true,
    canClawback: true,
    immutable: {
      canLock: false,
      requireAuth: true,
      canEscrow: false,
      canTrade: false,
      canTransfer: true,
      canClawback: false,
      metadata: false,
      transferFee: false,
    },
    metadata: `{
  "product": "building-shares",
  "titleReference": "",
  "valuationCode": ""
}`,
    note: 'These are identical shares in one building, not the government title. Holders must be authorized. Shares can be transferred, and that choice is permanent. They are not listed on the DEX. Clawback is available and can still be turned off later. Selling a whole property is an NFT sale to a named buyer: accepting the offer moves the certificate and the price together. A share sale is two payments, not one. Rent is an issued-currency payment, not a transfer of the shares.',
  },
}
