/**
 * Preset-backed NFT and MPT issuance slices for the Insurance and Properties desks.
 * Each mount owns its useState. Submission uses the same transaction shapes as IssuePage.
 * Nothing here submits until the operator presses the button.
 */
import { useState } from 'react'
import { useXrpl } from '../context/XrplContext'
import TxModal from '../components/TxModal'
import WalletCard from '../components/WalletCard'
import { SELL_NFT_FLAG, mptImmutableFlags, mptIssuanceFlags, nftMintFlags } from '../lib/txFlags'

function toHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function Flag({ label, hint, checked, onChange, name }) {
  return (
    <label className="flag-row" title={hint}>
      <input type="checkbox" checked={checked} data-flag={name} onChange={e => onChange(e.target.checked)} />
      <span className="flag-label">{label}</span>
      {hint && <span className="flag-hint">{hint}</span>}
    </label>
  )
}

export function DeskProducts({ products, active, onChange }) {
  return (
    <div className="glass-card" style={{ marginBottom: 10 }}>
      <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
        {products.map(product => (
          <button
            type="button"
            key={product.id}
            data-desk-product={product.id}
            className={'tab-btn' + (active === product.id ? ' tab-btn-active' : '')}
            onClick={() => onChange(product.id)}
          >
            {product.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DeskLayout({ kicker, title, lede, products, active, onChange, children }) {
  const { wallet } = useXrpl()
  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">{kicker}</div>
        <h2>{title}</h2>
        <p>{lede}</p>
      </div>
      <DeskProducts products={products} active={active} onChange={onChange} />
      {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
      <div className="grid-2">
        <div className="flow">{children}</div>
        <div className="flow">
          <WalletCard />
        </div>
      </div>
    </div>
  )
}

export function NftMintForm({ preset, showNote = true }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()
  const [taxon, setTaxon] = useState('0')
  const [uri, setUri] = useState('')
  const [transferFee, setTransferFee] = useState(preset.transferFee)
  const [mintIssuer, setMintIssuer] = useState('')
  const [tfBurnable, setTfBurnable] = useState(preset.burnable)
  const [tfOnlyXRP, setTfOnlyXRP] = useState(preset.onlyXrp)
  const [tfTransferable, setTfTransferable] = useState(preset.transferable)
  const [tfMutable, setTfMutable] = useState(preset.mutableUri)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txResult, setTxResult] = useState(null)

  const mint = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'NFTokenMint',
        Account: wallet.address,
        NFTokenTaxon: Number(taxon),
        Flags: nftMintFlags({
          burnable: tfBurnable,
          onlyXrp: tfOnlyXRP,
          transferable: tfTransferable,
          mutable: tfMutable,
        }),
      }
      if (transferFee && Number(transferFee) > 0)
        tx.TransferFee = Math.round(Number(transferFee) * 1000)
      if (uri.trim())
        tx.URI = xrpl.convertStringToHex(uri.trim())
      if (mintIssuer.trim())
        tx.Issuer = mintIssuer.trim()

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenMint', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Mint failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="glass-card fade-in" data-product={preset.id}>
      <div className="section-title">{preset.label}</div>
      <p className="muted">Creates an NFToken. These flags are <strong>immutable after minting</strong>. The preset is already filled in and does not mint. Taxon stays as you set it.</p>
      {showNote && <div className="alert alert-info">{preset.note}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="flags-grid">
        <Flag name="burnable" label="Burnable" hint="Issuer (or authorized party) can destroy this NFT." checked={tfBurnable} onChange={setTfBurnable} />
        <Flag name="onlyXrp" label="Only XRP" hint="Token can only be bought/sold for XRP." checked={tfOnlyXRP} onChange={setTfOnlyXRP} />
        <Flag name="transferable" label="Transferable" hint="NFT can be transferred. Required if TransferFee > 0." checked={tfTransferable} onChange={setTfTransferable} />
        <Flag name="mutable" label="Mutable URI" hint="URI can be updated later via NFTokenModify." checked={tfMutable} onChange={setTfMutable} />
      </div>
      <div className="field-row" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Taxon (collection ID)</label>
          <input data-field="taxon" type="number" placeholder="0" value={taxon} onChange={e => setTaxon(e.target.value)} min="0" />
        </div>
        <div className="field">
          <label>Transfer fee % (0–50)</label>
          <input data-field="transferFee" type="number" placeholder="0" value={transferFee}
            onChange={e => setTransferFee(e.target.value)} min="0" max="50" step="0.001" />
        </div>
      </div>
      <div className="field">
        <label>URI (metadata link)</label>
        <input data-field="uri" type="text" placeholder="ipfs://… or https://…" value={uri} onChange={e => setUri(e.target.value)} />
      </div>
      <div className="field">
        <label>Issuer (only for authorized minting on behalf of another account)</label>
        <input type="text" placeholder="r… leave blank to mint for yourself" value={mintIssuer} onChange={e => setMintIssuer(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-full" onClick={mint} disabled={loading || !wallet}>
        {loading ? <><span className="spinner"></span> Minting…</> : 'Mint NFT'}
      </button>
      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

export function MptCreateForm({ preset }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()
  const [assetScale, setAssetScale] = useState(preset.assetScale)
  const [maxAmount, setMaxAmount] = useState('')
  const [transferFee, setTransferFee] = useState('0')
  const [metadata, setMetadata] = useState(preset.metadata)
  const [tfCanLock, setTfCanLock] = useState(preset.canLock)
  const [tfRequireAuth, setTfRequireAuth] = useState(preset.requireAuth)
  const [tfCanEscrow, setTfCanEscrow] = useState(preset.canEscrow)
  const [tfCanTrade, setTfCanTrade] = useState(preset.canTrade)
  const [tfCanTransfer, setTfCanTransfer] = useState(preset.canTransfer)
  const [tfCanClawback, setTfCanClawback] = useState(preset.canClawback)
  const [tifCanLock, setTifCanLock] = useState(preset.immutable.canLock)
  const [tifRequireAuth, setTifRequireAuth] = useState(preset.immutable.requireAuth)
  const [tifCanEscrow, setTifCanEscrow] = useState(preset.immutable.canEscrow)
  const [tifCanTrade, setTifCanTrade] = useState(preset.immutable.canTrade)
  const [tifCanTransfer, setTifCanTransfer] = useState(preset.immutable.canTransfer)
  const [tifCanClawback, setTifCanClawback] = useState(preset.immutable.canClawback)
  const [tifMetadata, setTifMetadata] = useState(preset.immutable.metadata)
  const [tifTransferFee, setTifTransferFee] = useState(preset.immutable.transferFee)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txResult, setTxResult] = useState(null)

  const createIssuance = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const flags = mptIssuanceFlags({
        canLock: tfCanLock,
        requireAuth: tfRequireAuth,
        canEscrow: tfCanEscrow,
        canTrade: tfCanTrade,
        canTransfer: tfCanTransfer,
        canClawback: tfCanClawback,
      })
      const immFlags = mptImmutableFlags({
        canLock: tifCanLock,
        requireAuth: tifRequireAuth,
        canEscrow: tifCanEscrow,
        canTrade: tifCanTrade,
        canTransfer: tifCanTransfer,
        canClawback: tifCanClawback,
        metadata: tifMetadata,
        transferFee: tifTransferFee,
      })
      const tx = {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: wallet.address,
        Flags: flags,
        AssetScale: Number(assetScale),
      }
      const tfRaw = Math.round(Number(transferFee) * 1000)
      if (tfRaw > 0) tx.TransferFee = tfRaw
      if (maxAmount.trim()) tx.MaximumAmount = maxAmount.trim()
      if (metadata.trim()) tx.MPTokenMetadata = toHex(metadata.trim())
      if (immFlags > 0) tx.ImmutableFlags = immFlags

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenIssuanceCreate', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Create failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="glass-card fade-in" data-product={preset.id}>
      <div className="section-title">{preset.label}</div>
      <p className="muted">Defines a new Multi-Purpose Token. Mutable flags can be changed later; immutable flags are locked forever. The preset is already filled in and does not create the issuance.</p>
      <div className="alert alert-info">{preset.note}</div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="subsection-label">Mutable flags (can be toggled after creation)</div>
      <div className="flags-grid">
        <Flag name="canLock" label="Can Lock" hint="Issuer can lock individual or all holders." checked={tfCanLock} onChange={setTfCanLock} />
        <Flag name="requireAuth" label="Require Auth" hint="Holders must be authorized before receiving tokens." checked={tfRequireAuth} onChange={setTfRequireAuth} />
        <Flag name="canEscrow" label="Can Escrow" hint="Holders can place their balances into escrow." checked={tfCanEscrow} onChange={setTfCanEscrow} />
        <Flag name="canTrade" label="Can Trade" hint="Holders can trade balances on the XRPL DEX." checked={tfCanTrade} onChange={setTfCanTrade} />
        <Flag name="canTransfer" label="Can Transfer" hint="Tokens can be transferred to accounts other than the issuer." checked={tfCanTransfer} onChange={setTfCanTransfer} />
        <Flag name="canClawback" label="Can Clawback" hint="Issuer can claw back tokens from individual holders." checked={tfCanClawback} onChange={setTfCanClawback} />
      </div>

      <div className="subsection-label" style={{ marginTop: 10 }}>Immutable flags (permanent — choose carefully)</div>
      <div className="flags-grid">
        <Flag name="lockImmutable" label="Lock immutable" hint="The Can Lock flag can never be changed." checked={tifCanLock} onChange={setTifCanLock} />
        <Flag name="requireAuthImmutable" label="Require Auth immutable" hint="The Require Auth flag can never be changed." checked={tifRequireAuth} onChange={setTifRequireAuth} />
        <Flag name="escrowImmutable" label="Escrow immutable" hint="The Can Escrow flag can never be changed." checked={tifCanEscrow} onChange={setTifCanEscrow} />
        <Flag name="tradeImmutable" label="Trade immutable" hint="The Can Trade flag can never be changed." checked={tifCanTrade} onChange={setTifCanTrade} />
        <Flag name="transferImmutable" label="Transfer immutable" hint="The Can Transfer flag can never be changed." checked={tifCanTransfer} onChange={setTifCanTransfer} />
        <Flag name="clawbackImmutable" label="Clawback immutable" hint="The Can Clawback flag can never be changed." checked={tifCanClawback} onChange={setTifCanClawback} />
        <Flag name="metadataImmutable" label="Metadata immutable" hint="MPTokenMetadata can never be modified." checked={tifMetadata} onChange={setTifMetadata} />
        <Flag name="transferFeeImmutable" label="Transfer fee immutable" hint="TransferFee can never be modified." checked={tifTransferFee} onChange={setTifTransferFee} />
      </div>

      <div className="field-row" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Asset scale (decimal places, 0–255)</label>
          <input data-field="assetScale" type="number" placeholder="0" value={assetScale}
            onChange={e => setAssetScale(e.target.value)} min="0" max="255" />
        </div>
        <div className="field">
          <label>Transfer fee % (0–50)</label>
          <input data-field="transferFee" type="number" placeholder="0" value={transferFee}
            onChange={e => setTransferFee(e.target.value)} min="0" max="50" step="0.001" />
        </div>
      </div>
      <div className="field">
        <label>Max supply (optional uint64 string)</label>
        <input type="text" placeholder="e.g. 9223372036854775807" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} className="mono" />
      </div>
      <div className="field">
        <label>Metadata (JSON or text, hex-encoded on-chain)</label>
        <textarea data-field="metadata" rows={6} placeholder='{"name":"My Token","description":"..."}' value={metadata}
          onChange={e => setMetadata(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-full" onClick={createIssuance} disabled={loading || !wallet}>
        {loading ? <><span className="spinner"></span> Creating…</> : 'Create issuance'}
      </button>
      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

export function NftSellForm() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()
  const [sellNftId, setSellNftId] = useState('')
  const [sellAmount, setSellAmount] = useState('')
  const [sellCur, setSellCur] = useState('XRP')
  const [sellIss, setSellIss] = useState('')
  const [sellDest, setSellDest] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [txResult, setTxResult] = useState(null)

  const buildNftAmount = (amt, cur, iss) =>
    cur === 'XRP' ? xrpl.xrpToDrops(amt || '0') : { currency: cur, issuer: iss.trim(), value: amt }

  const createSellOffer = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    if (!sellNftId.trim()) { setError('NFToken ID required.'); return }
    if (!sellDest.trim()) { setError('Named buyer address is required. Set Destination to that account.'); return }
    if (sellCur !== 'XRP' && !sellIss.trim()) { setError('Issuer required for token offers.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'NFTokenCreateOffer',
        Account: wallet.address,
        NFTokenID: sellNftId.trim(),
        Flags: SELL_NFT_FLAG,
        Amount: buildNftAmount(sellAmount, sellCur, sellIss),
      }
      if (sellDest.trim()) tx.Destination = sellDest.trim()

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenCreateOffer (Sell)', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Sell offer failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="glass-card fade-in" data-product="property-sale">
      <div className="section-title">Create sell offer</div>
      <p className="muted">Completion is an NFTokenCreateOffer with Destination set to the named buyer. Rent and the purchase price stay issued-currency payments. This button does not send those payments. Use 0 when the certificate should move without an offer price.</p>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="field">
        <label>NFToken ID</label>
        <input data-field="nftId" type="text" placeholder="000800… 64-char hex" value={sellNftId} onChange={e => setSellNftId(e.target.value)} className="mono" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Price currency</label>
          <select value={sellCur} onChange={e => setSellCur(e.target.value)}>
            <option value="XRP">XRP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="other">Other IOU</option>
          </select>
        </div>
        <div className="field">
          <label>Price amount (0 = gift)</label>
          <input data-field="price" type="number" placeholder="0" value={sellAmount} onChange={e => setSellAmount(e.target.value)} min="0" step="any" />
        </div>
      </div>
      {sellCur !== 'XRP' && (
        <div className="field">
          <label>Currency issuer</label>
          <input type="text" placeholder="r…" value={sellIss} onChange={e => setSellIss(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label>Named buyer (Destination)</label>
        <input data-field="destination" type="text" placeholder="r…" value={sellDest} onChange={e => setSellDest(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary btn-full" onClick={createSellOffer} disabled={loading || !wallet}>
        {loading ? <><span className="spinner"></span> Creating…</> : 'Create sell offer'}
      </button>
      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}
