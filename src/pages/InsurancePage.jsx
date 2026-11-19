import { useState } from 'react'
import { mptPresets, nftPresets } from '../lib/productPresets'
import { DeskLayout, MptCreateForm, NftMintForm } from '../issue/productForms'

const PRODUCTS = [
  { id: 'policy', label: 'Policy certificate' },
  { id: 'claim', label: 'Claim file' },
  { id: 'cover', label: 'Cover units' },
]

export default function InsurancePage() {
  const [product, setProduct] = useState('policy')
  return (
    <DeskLayout
      kicker="Insurance"
      title="Policy, claim, and cover."
      lede="Each product keeps its own form. The matching preset is already filled in, and nothing is sent until you submit. This desk does not send NFTokenModify. Premiums and claim payouts stay issued-currency payments. A private reinsurance line stays on the Confidential desk."
      products={PRODUCTS}
      active={product}
      onChange={setProduct}
    >
      <div hidden={product !== 'policy'}>
        <NftMintForm preset={nftPresets.policy} />
      </div>
      <div hidden={product !== 'claim'}>
        <NftMintForm preset={nftPresets.claim} />
      </div>
      <div hidden={product !== 'cover'}>
        <MptCreateForm preset={mptPresets.cover} />
      </div>
    </DeskLayout>
  )
}
