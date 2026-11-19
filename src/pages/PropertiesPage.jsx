import { useState } from 'react'
import { mptPresets, nftPresets } from '../lib/productPresets'
import { DeskLayout, MptCreateForm, NftMintForm, NftSellForm } from '../issue/productForms'

const PRODUCTS = [
  { id: 'building', label: 'Building shares' },
  { id: 'property', label: 'Whole property' },
]

function WholeProperty() {
  const [step, setStep] = useState('mint')
  return (
    <div className="flow">
      <div className="alert alert-info">{nftPresets.property.note}</div>
      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            data-desk-product="property-mint"
            className={'tab-btn' + (step === 'mint' ? ' tab-btn-active' : '')}
            onClick={() => setStep('mint')}
          >
            Mint certificate
          </button>
          <button
            type="button"
            data-desk-product="property-sell"
            className={'tab-btn' + (step === 'sell' ? ' tab-btn-active' : '')}
            onClick={() => setStep('sell')}
          >
            Sell to named buyer
          </button>
        </div>
      </div>
      <div hidden={step !== 'mint'}>
        <NftMintForm preset={nftPresets.property} showNote={false} />
      </div>
      <div hidden={step !== 'sell'}>
        <NftSellForm />
      </div>
    </div>
  )
}

export default function PropertiesPage() {
  const [product, setProduct] = useState('building')
  return (
    <DeskLayout
      kicker="Properties"
      title="Shares and the whole-property certificate."
      lede="Building shares are one MPT issuance. A whole property is a bank or trustee certificate, not the government title. Rent and the purchase price stay issued-currency payments."
      products={PRODUCTS}
      active={product}
      onChange={setProduct}
    >
      <div hidden={product !== 'building'}>
        <MptCreateForm preset={mptPresets.building} />
      </div>
      <div hidden={product !== 'property'}>
        <WholeProperty />
      </div>
    </DeskLayout>
  )
}
