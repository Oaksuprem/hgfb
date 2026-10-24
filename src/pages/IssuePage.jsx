/**
 * IssuePage — Asset Issuance Hub
 * Covers three token types:
 *   FT  — Fungible Tokens  (AccountSet + TrustSet + Payment + Clawback)
 *   NFT — Non-Fungible Tokens (NFTokenMint + CreateOffer + AcceptOffer + CancelOffer + Burn)
 *   MPT — Multi-Purpose Tokens (MPTokenIssuanceCreate/Destroy/Set + MPTokenAuthorize + Payment)
 */

import { useState, useEffect, useCallback } from 'react'
import { useXrpl, EXPLORERS } from '../context/XrplContext'
import TxModal from '../components/TxModal'
import WalletCard from '../components/WalletCard'
import { useTxBatch } from '../hooks/transactions/useTxBatch'
import BatchProgress from '../components/BatchProgress'
import { buildMintNFT, buildAuthorizeMPT, buildDistributeMPT } from '../services/TokenService'

// ─── helpers ────────────────────────────────────────────────────────────────

function toHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function Flag({ label, hint, checked, onChange }) {
  return (
    <label className="flag-row" title={hint}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="flag-label">{label}</span>
      {hint && <span className="flag-hint">{hint}</span>}
    </label>
  )
}

// ─── FT panel ───────────────────────────────────────────────────────────────

function FTPanel() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  // --- Configure tab ---
  // AccountSet accepts one SetFlag and one ClearFlag per transaction.
  // Flags that also have a tf bit can share a single transaction.
  const [ftSetFlags,      setFtSetFlags]      = useState(['asfDefaultRipple'])
  const [ftClearFlags,    setFtClearFlags]    = useState([])
  const [ftTransferRate,  setFtTransferRate]   = useState('0')
  const [ftTickSize,      setFtTickSize]       = useState('')
  const [ftDomain,        setFtDomain]         = useState('')
  const [ftEmailHash,     setFtEmailHash]      = useState('')
  const [ftMessageKey,    setFtMessageKey]     = useState('')

  // --- Distribute tab ---
  const [ftCurrency,   setFtCurrency]   = useState('USD')
  const [ftLimit,      setFtLimit]      = useState('1000000000')
  const [ftAmount,     setFtAmount]     = useState('')
  const [ftDest,       setFtDest]       = useState('')
  // Partial payment fields
  const [ftSendMax,    setFtSendMax]    = useState('')
  const [ftDeliverMin, setFtDeliverMin] = useState('')
  const [ftPartial,    setFtPartial]    = useState(false)
  const [ftDestTag,    setFtDestTag]    = useState('')
  const [ftMemo,       setFtMemo]       = useState('')

  // --- Authorize trust line tab ---
  const [ftAuthHolder, setFtAuthHolder] = useState('')
  const [ftAuthCur,    setFtAuthCur]    = useState('USD')

  // --- Clawback tab ---
  const [clawCurrency, setClawCurrency] = useState('USD')
  const [clawHolder,   setClawHolder]   = useState('')
  const [clawAmount,   setClawAmount]   = useState('')

  const [tab,      setTab]      = useState('configure')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [txResult, setTxResult] = useState(null)

  const ASF_FLAGS = [
    { name: 'asfRequireDestTag', value: 1, label: 'Require destination tag', hint: 'Payments must include a destination tag.', tfSet: 0x00010000, tfClear: 0x00020000 },
    { name: 'asfRequireAuth', value: 2, label: 'Require authorization', hint: 'You must authorize each trust line.', tfSet: 0x00040000, tfClear: 0x00080000 },
    { name: 'asfDisallowXRP', value: 3, label: 'Disallow XRP', hint: 'Advisory. Asks others not to send XRP here.', tfSet: 0x00100000, tfClear: 0x00200000 },
    { name: 'asfDisableMaster', value: 4, label: 'Disable master key', hint: 'Irreversible without a regular key or signer list.' },
    { name: 'asfAccountTxnID', value: 5, label: 'Track transaction ID', hint: 'Require AccountTxnID on later transactions.' },
    { name: 'asfNoFreeze', value: 6, label: 'No freeze', hint: 'Permanent. You can never freeze balances.' },
    { name: 'asfGlobalFreeze', value: 7, label: 'Global freeze', hint: 'Freeze every trust line until you clear it.' },
    { name: 'asfDefaultRipple', value: 8, label: 'Default rippling', hint: 'New trust lines ripple by default.' },
    { name: 'asfDepositAuth', value: 9, label: 'Deposit authorization', hint: 'You must preauthorize incoming payments.' },
    { name: 'asfDisallowIncomingNFTokenOffer', value: 12, label: 'Block incoming NFT offers', hint: 'Reject NFTokenCreateOffer aimed at this account.' },
    { name: 'asfDisallowIncomingCheck', value: 13, label: 'Block incoming checks', hint: 'Reject checks created for this account.' },
    { name: 'asfDisallowIncomingPayChan', value: 14, label: 'Block incoming channels', hint: 'Reject payment channels funded to this account.' },
    { name: 'asfDisallowIncomingTrustline', value: 15, label: 'Block incoming trust lines', hint: 'Others cannot open a line to this account.' },
    { name: 'asfAllowTrustLineClawback', value: 16, label: 'Allow clawback', hint: 'Permanent. Enable only before any trust lines exist.' },
    { name: 'asfAllowTrustLineLocking', value: 17, label: 'Allow trust line locking', hint: 'Permanent. Lets you lock individual trust lines.' },
  ]

  const toggleIssuerFlag = (which, name, on) => {
    const setThis = which === 'set' ? setFtSetFlags : setFtClearFlags
    const setOther = which === 'set' ? setFtClearFlags : setFtSetFlags
    if (on) {
      setThis(prev => prev.includes(name) ? prev : [...prev, name])
      setOther(prev => prev.filter(flag => flag !== name))
    } else {
      setThis(prev => prev.filter(flag => flag !== name))
    }
  }

  const configureIssuer = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const byName = Object.fromEntries(ASF_FLAGS.map(flag => [flag.name, flag]))
      const setQueue = []
      const clearQueue = []
      let tf = 0
      for (const name of ftSetFlags) {
        const flag = byName[name]
        if (!flag) continue
        if (flag.tfSet) tf |= flag.tfSet
        else setQueue.push(flag.value)
      }
      for (const name of ftClearFlags) {
        const flag = byName[name]
        if (!flag || ftSetFlags.includes(name)) continue
        if (flag.tfClear) tf |= flag.tfClear
        else clearQueue.push(flag.value)
      }

      const settings = {
        TransactionType: 'AccountSet',
        Account: wallet.address,
        TransferRate: Number(ftTransferRate) === 0
          ? 0
          : Math.round(Number(ftTransferRate) * 10_000_000 + 1_000_000_000),
      }
      if (ftTickSize) settings.TickSize = Number(ftTickSize)
      if (ftDomain.trim()) settings.Domain = toHex(ftDomain.trim().toLowerCase())
      if (ftEmailHash.trim()) settings.EmailHash = ftEmailHash.trim()
      if (ftMessageKey.trim()) settings.MessageKey = ftMessageKey.trim()

      const batch = []
      const first = { ...settings }
      if (tf) first.Flags = tf
      if (setQueue.length) first.SetFlag = setQueue.shift()
      if (clearQueue.length) first.ClearFlag = clearQueue.shift()
      batch.push(first)
      while (setQueue.length || clearQueue.length) {
        const tx = { TransactionType: 'AccountSet', Account: wallet.address }
        if (setQueue.length) tx.SetFlag = setQueue.shift()
        if (clearQueue.length) tx.ClearFlag = clearQueue.shift()
        batch.push(tx)
      }

      let last = null
      for (let i = 0; i < batch.length; i++) {
        const result = await c.submitAndWait(batch[i], { wallet: w })
        const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
        if (!ok) {
          setTxResult(result)
          addTx()
          throw new Error((result.result.meta.TransactionResult || 'AccountSet failed') + ` on setting ${i + 1} of ${batch.length}`)
        }
        last = result
      }
      setTxResult(last)
      addTx()
    } catch (e) { setError('AccountSet failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const distribute = async () => {
    if (!wallet)            { setError('Open a book first.'); return }
    if (!ftDest.trim())     { setError('Destination address required.'); return }
    if (!ftCurrency.trim()) { setError('Currency code required.'); return }
    if (!ftAmount)          { setError('Amount required.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'Payment',
        Account: wallet.address,
        Destination: ftDest.trim(),
        Amount: {
          currency: ftCurrency.trim().toUpperCase(),
          issuer: wallet.address,
          value: ftAmount,
        },
      }
      if (ftPartial) {
        tx.Flags = 0x00020000 // tfPartialPayment
        if (ftSendMax) tx.SendMax = { currency: ftCurrency.trim().toUpperCase(), issuer: wallet.address, value: ftSendMax }
        if (ftDeliverMin) tx.DeliverMin = { currency: ftCurrency.trim().toUpperCase(), issuer: wallet.address, value: ftDeliverMin }
      }
      if (ftDestTag) tx.DestinationTag = Number(ftDestTag)
      if (ftMemo.trim()) tx.Memos = [{ Memo: { MemoData: xrpl.convertStringToHex(ftMemo.trim()) } }]

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'Issue FT', status: ok ? 'success' : 'error', amount: ftAmount, currency: ftCurrency, hash: result.result.hash })
    } catch (e) { setError('Issue failed: ' + e.message) }
    finally { setLoading(false) }
  }

  // Issuer authorizes a specific holder's trust line (requires asfRequireAuth)
  const authorizeHolder = async () => {
    if (!wallet || !ftAuthHolder.trim() || !ftAuthCur.trim()) {
      setError('Currency and holder address required.'); return
    }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'TrustSet',
        Account: wallet.address,
        LimitAmount: {
          currency: ftAuthCur.trim().toUpperCase(),
          issuer: ftAuthHolder.trim(), // from issuer's perspective, counterparty is the holder
          value: '0',
        },
        Flags: 0x00010000, // tfSetfAuth
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'TrustSet (Auth Holder)', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Authorize failed: ' + e.message) }
    finally { setLoading(false) }
  }

  // Clawback issued tokens from a holder
  const clawback = async () => {
    if (!wallet || !clawHolder.trim() || !clawCurrency.trim() || !clawAmount) {
      setError('Currency, holder, and amount are required.'); return
    }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'Clawback',
        Account: wallet.address,
        Amount: {
          currency: clawCurrency.trim().toUpperCase(),
          issuer: clawHolder.trim(), // Amount.issuer is the holder when issuer claws back
          value: clawAmount,
        },
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'Clawback', status: ok ? 'success' : 'error', amount: clawAmount, currency: clawCurrency, hash: result.result.hash })
    } catch (e) { setError('Clawback failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const FT_TABS = [['configure', 'Configure Issuer'], ['distribute', 'Distribute'], ['authorize', 'Authorize Holder'], ['clawback', 'Clawback']]

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
      {error   && <div className="alert alert-danger">{error}</div>}

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar">
          {FT_TABS.map(([k, l]) => (
            <button key={k} className={'tab-btn' + (tab === k ? ' tab-btn-active' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'configure' && (
        <div className="glass-card fade-in">
          <div className="section-title">Issuer account settings</div>
          <p className="muted">Select every flag to enable or clear. Each choice is written with a valid AccountSet, and flags that can share a transaction are sent together.</p>

          <div className="subsection-label">Enable</div>
          <div className="flags-grid">
            {ASF_FLAGS.map(flag => (
              <label key={flag.name} className="flag-row">
                <input
                  type="checkbox"
                  checked={ftSetFlags.includes(flag.name)}
                  onChange={e => toggleIssuerFlag('set', flag.name, e.target.checked)}
                />
                <span>
                  <span className="flag-label">{flag.label}</span>
                  <span className="flag-hint">{flag.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="subsection-label">Clear</div>
          <div className="flags-grid">
            {ASF_FLAGS.map(flag => (
              <label key={flag.name} className="flag-row">
                <input
                  type="checkbox"
                  checked={ftClearFlags.includes(flag.name)}
                  onChange={e => toggleIssuerFlag('clear', flag.name, e.target.checked)}
                />
                <span>
                  <span className="flag-label">{flag.label}</span>
                  <span className="flag-hint">Turn this setting off.</span>
                </span>
              </label>
            ))}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Transfer fee %</label>
              <input type="number" placeholder="0" value={ftTransferRate}
                onChange={e => setFtTransferRate(e.target.value)} min="0" max="100" step="0.001" />
            </div>
            <div className="field">
              <label>Tick size (3–15, 0=off)</label>
              <input type="number" placeholder="0" value={ftTickSize}
                onChange={e => setFtTickSize(e.target.value)} min="0" max="15" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Domain (e.g. example.com)</label>
              <input type="text" placeholder="yourdomain.com" value={ftDomain} onChange={e => setFtDomain(e.target.value)} />
            </div>
            <div className="field">
              <label>Email hash (MD5 hex, 32 chars)</label>
              <input type="text" placeholder="Optional" value={ftEmailHash} onChange={e => setFtEmailHash(e.target.value)} className="mono" maxLength={32} />
            </div>
          </div>
          <div className="field">
            <label>Message key (hex public key for encrypted messages)</label>
            <input type="text" placeholder="Optional hex" value={ftMessageKey} onChange={e => setFtMessageKey(e.target.value)} className="mono" />
          </div>

          <button className="btn btn-primary btn-full" onClick={configureIssuer} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Applying…</> : 'Apply issuer settings'}
          </button>
        </div>
      )}

      {tab === 'distribute' && (
        <div className="glass-card fade-in">
          <div className="section-title">Issue &amp; distribute</div>
          <p className="muted">Send issued tokens to a recipient who already has a trust line open to you.</p>

          <div className="field-row">
            <div className="field">
              <label>Currency code</label>
              <input type="text" placeholder="USD" value={ftCurrency}
                onChange={e => setFtCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field">
              <label>Amount</label>
              <input type="number" placeholder="1000" value={ftAmount}
                onChange={e => setFtAmount(e.target.value)} min="0" step="any" />
            </div>
          </div>
          <div className="field">
            <label>Recipient</label>
            <input type="text" placeholder="r… (must have trust line to you)" value={ftDest}
              onChange={e => setFtDest(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Destination tag</label>
              <input type="number" placeholder="Optional" value={ftDestTag} onChange={e => setFtDestTag(e.target.value)} min="0" />
            </div>
            <div className="field">
              <label>Memo</label>
              <input type="text" placeholder="On-chain note" value={ftMemo} onChange={e => setFtMemo(e.target.value)} />
            </div>
          </div>

          <label className="flag-row" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={ftPartial} onChange={e => setFtPartial(e.target.checked)} />
            <span className="flag-label">Partial payment (tfPartialPayment)</span>
            <span className="flag-hint">Deliver as much as possible; use SendMax / DeliverMin to constrain.</span>
          </label>

          {ftPartial && (
            <div className="field-row">
              <div className="field">
                <label>SendMax (maximum to spend)</label>
                <input type="number" placeholder="e.g. 110" value={ftSendMax}
                  onChange={e => setFtSendMax(e.target.value)} min="0" step="any" />
              </div>
              <div className="field">
                <label>DeliverMin (minimum acceptable)</label>
                <input type="number" placeholder="e.g. 95" value={ftDeliverMin}
                  onChange={e => setFtDeliverMin(e.target.value)} min="0" step="any" />
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-full" onClick={distribute} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Issuing…</> : 'Issue tokens'}
          </button>
        </div>
      )}

      {tab === 'authorize' && (
        <div className="glass-card fade-in">
          <div className="section-title">Authorize trust line holder</div>
          <p className="muted">Required when your issuer has <code>asfRequireAuth</code> set. Sends a TrustSet from the issuer to pre-approve a specific holder.</p>

          <div className="alert alert-info" style={{ marginBottom: 10 }}>
            The issuer must have <code>asfRequireAuth</code> set before any trust lines are created. This TrustSet sets <code>tfSetfAuth</code> on the issuer's side.
          </div>

          <div className="field-row">
            <div className="field">
              <label>Currency code</label>
              <input type="text" placeholder="USD" value={ftAuthCur}
                onChange={e => setFtAuthCur(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field">
              <label>Holder address</label>
              <input type="text" placeholder="r…" value={ftAuthHolder} onChange={e => setFtAuthHolder(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={authorizeHolder} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Authorizing…</> : 'Authorize holder'}
          </button>
        </div>
      )}

      {tab === 'clawback' && (
        <div className="glass-card fade-in">
          <div className="section-title">Clawback issued tokens</div>
          <p className="muted">Reclaim tokens from a holder. Only available if the issuer set <code>asfAllowTrustLineClawback</code> before any trust lines were created.</p>

          <div className="alert alert-warning" style={{ marginBottom: 10 }}>
            Clawback reduces the holder's balance. The <code>Amount.issuer</code> field must be the <strong>holder's address</strong>, not the issuer's.
          </div>

          <div className="field-row">
            <div className="field">
              <label>Currency code</label>
              <input type="text" placeholder="USD" value={clawCurrency}
                onChange={e => setClawCurrency(e.target.value)} maxLength={3} style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="field">
              <label>Amount to claw back</label>
              <input type="number" placeholder="100" value={clawAmount}
                onChange={e => setClawAmount(e.target.value)} min="0" step="any" />
            </div>
          </div>
          <div className="field">
            <label>Holder address (the account holding your tokens)</label>
            <input type="text" placeholder="r…" value={clawHolder} onChange={e => setClawHolder(e.target.value)} />
          </div>

          <button className="btn btn-danger btn-full" onClick={clawback} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Clawing back…</> : 'Claw back tokens'}
          </button>
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

// ─── NFT panel ──────────────────────────────────────────────────────────────

function NFTPanel() {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()

  // Mint fields
  const [taxon,       setTaxon]       = useState('0')
  const [uri,         setUri]         = useState('')
  const [transferFee, setTransferFee] = useState('0')
  const [mintIssuer,  setMintIssuer]  = useState('') // minting on behalf of another account
  const [tfBurnable,     setTfBurnable]     = useState(false)
  const [tfOnlyXRP,      setTfOnlyXRP]      = useState(false)
  const [tfTransferable, setTfTransferable] = useState(true)
  const [tfMutable,      setTfMutable]      = useState(false)

  // Sell offer
  const [sellNftId,  setSellNftId]  = useState('')
  const [sellAmount, setSellAmount] = useState('')
  const [sellCur,    setSellCur]    = useState('XRP')
  const [sellIss,    setSellIss]    = useState('')
  const [sellDest,   setSellDest]   = useState('')
  const [sellExpiry, setSellExpiry] = useState('')

  // Buy offer
  const [buyNftId,    setBuyNftId]    = useState('')
  const [buyAmount,   setBuyAmount]   = useState('')
  const [buyCur,      setBuyCur]      = useState('XRP')
  const [buyIss,      setBuyIss]      = useState('')
  const [buyOwner,    setBuyOwner]    = useState('')
  const [buyExpiry,   setBuyExpiry]   = useState('')

  // Accept offer
  const [acceptSellId, setAcceptSellId] = useState('')
  const [acceptBuyId,  setAcceptBuyId]  = useState('')
  const [brokerFee,    setBrokerFee]    = useState('')

  // Cancel offer
  const [cancelOfferIds, setCancelOfferIds] = useState('')

  // Burn
  const [burnNftId, setBurnNftId] = useState('')

  // My NFTs
  const [myNfts,      setMyNfts]      = useState([])
  const [loadingNfts, setLoadingNfts] = useState(false)

  const [tab,      setTab]      = useState('mint')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [txResult, setTxResult] = useState(null)

  // ── Batch collection minting ────────────────────────────────────────────
  const nftBatch       = useTxBatch()
  const [colCount,     setColCount]     = useState('5')
  const [colBaseUri,   setColBaseUri]   = useState('')
  const [colTaxon,     setColTaxon]     = useState('0')
  const [colFee,       setColFee]       = useState('0')
  const [colBurnable,  setColBurnable]  = useState(false)
  const [colTransfer,  setColTransfer]  = useState(true)

  const mintCollection = async () => {
    if (!wallet) return
    const n = Math.max(2, Math.min(250, Number(colCount)))
    const txs = Array.from({ length: n }, (_, i) => buildMintNFT({
      account: wallet.address,
      taxon: Number(colTaxon),
      uri: colBaseUri ? colBaseUri.replace('{i}', String(i)) : undefined,
      transferFee: colFee,
      flags: { burnable: colBurnable, transferable: colTransfer },
    }))
    const seqs = await nftBatch.createTicketBatch(n)
    if (!seqs) return
    const built = await nftBatch.buildBatch(txs)
    if (!built) return
    await nftBatch.submitBatch()
    setTimeout(fetchNfts, 3000)
  }

  const fetchNfts = useCallback(async () => {
    if (!wallet) { setMyNfts([]); return }
    setLoadingNfts(true)
    try {
      const c = await ensureConnected()
      const r = await c.request({ command: 'account_nfts', account: wallet.address, ledger_index: 'validated' })
      setMyNfts(r.result.account_nfts ?? [])
    } catch (e) { console.error(e); setMyNfts([]) }
    finally { setLoadingNfts(false) }
  }, [wallet, network, ensureConnected])

  useEffect(() => { if (wallet && tab === 'nfts') fetchNfts() }, [wallet, tab, fetchNfts])

  const buildNftAmount = (amt, cur, iss) =>
    cur === 'XRP' ? xrpl.xrpToDrops(amt || '0') : { currency: cur, issuer: iss.trim(), value: amt }

  const mint = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      let flags = 0
      if (tfBurnable)     flags |= 0x00000001
      if (tfOnlyXRP)      flags |= 0x00000002
      if (tfTransferable) flags |= 0x00000008
      if (tfMutable)      flags |= 0x00000010
      const tx = {
        TransactionType: 'NFTokenMint',
        Account: wallet.address,
        NFTokenTaxon: Number(taxon),
        Flags: flags,
      }
      if (transferFee && Number(transferFee) > 0)
        tx.TransferFee = Math.round(Number(transferFee) * 1000)
      if (uri.trim())
        tx.URI = xrpl.convertStringToHex(uri.trim())
      if (mintIssuer.trim())
        tx.Issuer = mintIssuer.trim() // minting on behalf of issuer account

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenMint', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchNfts, 2500)
    } catch (e) { setError('Mint failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const createSellOffer = async () => {
    if (!wallet || !sellNftId.trim()) { setError('NFToken ID required.'); return }
    if (sellCur !== 'XRP' && !sellIss.trim()) { setError('Issuer required for token offers.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'NFTokenCreateOffer',
        Account: wallet.address,
        NFTokenID: sellNftId.trim(),
        Flags: 1, // tfSellNFToken
        Amount: buildNftAmount(sellAmount, sellCur, sellIss),
      }
      if (sellDest.trim())  tx.Destination = sellDest.trim()
      if (sellExpiry)       tx.Expiration = Math.floor(new Date(sellExpiry).getTime() / 1000) - 946684800

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenCreateOffer (Sell)', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Sell offer failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const createBuyOffer = async () => {
    if (!wallet || !buyNftId.trim()) { setError('NFToken ID required.'); return }
    if (!buyOwner.trim()) { setError('Current owner address required for buy offers.'); return }
    if (buyCur !== 'XRP' && !buyIss.trim()) { setError('Issuer required for token buy offers.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'NFTokenCreateOffer',
        Account: wallet.address,
        NFTokenID: buyNftId.trim(),
        Owner: buyOwner.trim(),  // required for buy offers
        Amount: buildNftAmount(buyAmount, buyCur, buyIss),
        // no Flags = buy offer (Flags=0)
      }
      if (buyExpiry) tx.Expiration = Math.floor(new Date(buyExpiry).getTime() / 1000) - 946684800

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenCreateOffer (Buy)', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Buy offer failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const acceptOffer = async () => {
    if (!wallet) { setError('Open a book first.'); return }
    if (!acceptSellId.trim() && !acceptBuyId.trim()) {
      setError('At least one offer ID required.'); return
    }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'NFTokenAcceptOffer',
        Account: wallet.address,
      }
      if (acceptSellId.trim()) tx.NFTokenSellOffer = acceptSellId.trim()
      if (acceptBuyId.trim())  tx.NFTokenBuyOffer  = acceptBuyId.trim()
      // Brokered mode: both provided + broker fee
      if (brokerFee && acceptSellId.trim() && acceptBuyId.trim())
        tx.NFTokenBrokerFee = xrpl.xrpToDrops(brokerFee)

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenAcceptOffer', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchNfts, 2500)
    } catch (e) { setError('Accept offer failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const cancelOffers = async () => {
    if (!wallet || !cancelOfferIds.trim()) { setError('At least one offer ID required.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const ids = cancelOfferIds.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
      const result = await c.submitAndWait({
        TransactionType: 'NFTokenCancelOffer',
        Account: wallet.address,
        NFTokenOffers: ids,
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenCancelOffer', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Cancel failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const burn = async () => {
    if (!wallet || !burnNftId.trim()) { setError('NFToken ID required.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'NFTokenBurn',
        Account: wallet.address,
        NFTokenID: burnNftId.trim(),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'NFTokenBurn', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchNfts, 2500)
    } catch (e) { setError('Burn failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const NFT_TABS = [
    ['mint', 'Mint'], ['sell', 'Sell Offer'], ['buy', 'Buy Offer'],
    ['accept', 'Accept Offer'], ['cancel', 'Cancel Offer'], ['burn', 'Burn'], ['nfts', 'My NFTs'],
    ['collection', 'Collection Mint']
  ]

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
      {error   && <div className="alert alert-danger">{error}</div>}

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
          {NFT_TABS.map(([k, l]) => (
            <button key={k} className={'tab-btn' + (tab === k ? ' tab-btn-active' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'mint' && (
        <div className="glass-card fade-in">
          <div className="section-title">Mint NFT</div>
          <p className="muted">Creates an NFToken. These flags are <strong>immutable after minting</strong>.</p>
          <div className="flags-grid">
            <Flag label="Burnable"     hint="Issuer (or authorized party) can destroy this NFT."                    checked={tfBurnable}     onChange={setTfBurnable} />
            <Flag label="Only XRP"     hint="Token can only be bought/sold for XRP."                                checked={tfOnlyXRP}      onChange={setTfOnlyXRP} />
            <Flag label="Transferable" hint="NFT can be transferred. Required if TransferFee > 0."                  checked={tfTransferable} onChange={setTfTransferable} />
            <Flag label="Mutable URI"  hint="URI can be updated later via NFTokenModify."                           checked={tfMutable}      onChange={setTfMutable} />
          </div>
          <div className="field-row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Taxon (collection ID)</label>
              <input type="number" placeholder="0" value={taxon} onChange={e => setTaxon(e.target.value)} min="0" />
            </div>
            <div className="field">
              <label>Transfer fee % (0–50)</label>
              <input type="number" placeholder="0" value={transferFee}
                onChange={e => setTransferFee(e.target.value)} min="0" max="50" step="0.001" />
            </div>
          </div>
          <div className="field">
            <label>URI (metadata link)</label>
            <input type="text" placeholder="ipfs://… or https://…" value={uri} onChange={e => setUri(e.target.value)} />
          </div>
          <div className="field">
            <label>Issuer (only for authorized minting on behalf of another account)</label>
            <input type="text" placeholder="r… leave blank to mint for yourself" value={mintIssuer} onChange={e => setMintIssuer(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={mint} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Minting…</> : 'Mint NFT'}
          </button>
        </div>
      )}

      {tab === 'sell' && (
        <div className="glass-card fade-in">
          <div className="section-title">Create sell offer</div>
          <p className="muted">List your NFT for sale on the ledger. Leave destination blank for open market.</p>
          <div className="field">
            <label>NFToken ID</label>
            <input type="text" placeholder="000800… 64-char hex" value={sellNftId} onChange={e => setSellNftId(e.target.value)} className="mono" />
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
              <input type="number" placeholder="0" value={sellAmount} onChange={e => setSellAmount(e.target.value)} min="0" step="any" />
            </div>
          </div>
          {sellCur !== 'XRP' && (
            <div className="field">
              <label>Currency issuer</label>
              <input type="text" placeholder="r…" value={sellIss} onChange={e => setSellIss(e.target.value)} />
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label>Restrict to buyer (optional)</label>
              <input type="text" placeholder="r… leave blank for anyone" value={sellDest} onChange={e => setSellDest(e.target.value)} />
            </div>
            <div className="field">
              <label>Expiry date (optional)</label>
              <input type="date" value={sellExpiry} onChange={e => setSellExpiry(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-full" onClick={createSellOffer} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Creating…</> : 'Create sell offer'}
          </button>
        </div>
      )}

      {tab === 'buy' && (
        <div className="glass-card fade-in">
          <div className="section-title">Create buy offer</div>
          <p className="muted">Make an offer to purchase an NFT from its current owner. The owner can then accept or ignore it.</p>
          <div className="field">
            <label>NFToken ID</label>
            <input type="text" placeholder="000800… 64-char hex" value={buyNftId} onChange={e => setBuyNftId(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Current owner address</label>
            <input type="text" placeholder="r… required for buy offers" value={buyOwner} onChange={e => setBuyOwner(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Bid currency</label>
              <select value={buyCur} onChange={e => setBuyCur(e.target.value)}>
                <option value="XRP">XRP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="other">Other IOU</option>
              </select>
            </div>
            <div className="field">
              <label>Bid amount</label>
              <input type="number" placeholder="0" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} min="0" step="any" />
            </div>
          </div>
          {buyCur !== 'XRP' && (
            <div className="field">
              <label>Currency issuer</label>
              <input type="text" placeholder="r…" value={buyIss} onChange={e => setBuyIss(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>Expiry date (optional)</label>
            <input type="date" value={buyExpiry} onChange={e => setBuyExpiry(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={createBuyOffer} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Creating…</> : 'Create buy offer'}
          </button>
        </div>
      )}

      {tab === 'accept' && (
        <div className="glass-card fade-in">
          <div className="section-title">Accept NFT offer</div>
          <p className="muted">
            <strong>Direct:</strong> Provide only one offer ID — sell offer (buyer calls) or buy offer (owner calls).<br />
            <strong>Brokered:</strong> Provide both IDs + broker fee to settle as a broker.
          </p>
          <div className="field">
            <label>Sell offer ID (provide to accept as buyer)</label>
            <input type="text" placeholder="Offer object ID hex" value={acceptSellId} onChange={e => setAcceptSellId(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Buy offer ID (provide to accept as owner)</label>
            <input type="text" placeholder="Offer object ID hex" value={acceptBuyId} onChange={e => setAcceptBuyId(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Broker fee XRP (only for brokered mode — both IDs required)</label>
            <input type="number" placeholder="0" value={brokerFee} onChange={e => setBrokerFee(e.target.value)} min="0" step="any" />
          </div>
          <button className="btn btn-primary btn-full" onClick={acceptOffer} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Accepting…</> : 'Accept offer'}
          </button>
        </div>
      )}

      {tab === 'cancel' && (
        <div className="glass-card fade-in">
          <div className="section-title">Cancel NFT offer(s)</div>
          <p className="muted">Cancel one or more outstanding buy or sell offers you created. Enter one offer ID per line or comma-separated.</p>
          <div className="field">
            <label>Offer IDs (one per line or comma-separated)</label>
            <textarea rows={4} placeholder="A1B2C3…&#10;D4E5F6…" value={cancelOfferIds}
              onChange={e => setCancelOfferIds(e.target.value)} className="mono" />
          </div>
          <button className="btn btn-danger btn-full" onClick={cancelOffers} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Cancelling…</> : 'Cancel offer(s)'}
          </button>
        </div>
      )}

      {tab === 'burn' && (
        <div className="glass-card fade-in">
          <div className="section-title">Burn NFT</div>
          <p className="muted">Permanently destroys the NFToken. Owner can always burn; issuer can only burn if <code>tfBurnable</code> was set at mint.</p>
          <div className="field">
            <label>NFToken ID</label>
            <input type="text" placeholder="000800… 64-char hex" value={burnNftId} onChange={e => setBurnNftId(e.target.value)} className="mono" />
          </div>
          <button className="btn btn-danger btn-full" onClick={burn} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Burning…</> : 'Burn NFT'}
          </button>
        </div>
      )}

      {tab === 'nfts' && (
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>My NFTs</div>
            <button className="btn btn-secondary btn-sm" onClick={fetchNfts} disabled={loadingNfts}>
              {loadingNfts ? <span className="spinner"></span> : 'Refresh'}
            </button>
          </div>
          {!wallet ? (
            <div className="muted">Open a book to view NFTs.</div>
          ) : myNfts.length === 0 ? (
            <div className="muted" style={{ margin: 0 }}>{loadingNfts ? 'Loading…' : 'No NFTs yet. Mint one above.'}</div>
          ) : (
            <div className="nft-grid">
              {myNfts.map(nft => (
                <div key={nft.NFTokenID} className="nft-card">
                  <div className="nft-id mono">{nft.NFTokenID.slice(0, 8)}…{nft.NFTokenID.slice(-8)}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    <span className="badge badge-devnet">Taxon {nft.NFTokenTaxon}</span>
                    {(nft.Flags & 0x8) ? <span className="badge badge-connected">Transferable</span> : null}
                    {(nft.Flags & 0x1) ? <span className="badge badge-testnet">Burnable</span> : null}
                    {(nft.Flags & 0x2) ? <span className="badge badge-mainnet">XRP-only</span> : null}
                  </div>
                  {nft.URI && (
                    <div className="nft-uri muted" style={{ marginTop: 4, wordBreak: 'break-all', fontSize: '0.65rem' }}>
                      {(() => { try { return decodeURIComponent(nft.URI.replace(/[0-9a-f]{2}/gi, '%$&')) } catch { return nft.URI } })()}
                    </div>
                  )}
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }}
                    onClick={() => {
                      setBurnNftId(nft.NFTokenID)
                      setSellNftId(nft.NFTokenID)
                      setBuyNftId(nft.NFTokenID)
                      setTab('sell')
                    }}>
                    Use this NFT
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'collection' && (
        <div className="glass-card fade-in">
          <div className="section-title">Mint NFT collection</div>
          <p className="muted">Mint multiple NFTs in parallel using XRPL Tickets. Use <code>{'{i}'}</code> in URI for a per-NFT index (e.g. <code>{'ipfs://CID/{i}.json'}</code>).</p>

          {!wallet && <div className="alert alert-warning">Open a book first.</div>}

          <div className="field-row">
            <div className="field">
              <label>Count (2\u2013250)</label>
              <input type="number" placeholder="5" value={colCount}
                onChange={e => setColCount(e.target.value)} min="2" max="250" />
            </div>
            <div className="field">
              <label>Taxon (collection ID)</label>
              <input type="number" placeholder="0" value={colTaxon}
                onChange={e => setColTaxon(e.target.value)} min="0" />
            </div>
            <div className="field">
              <label>Transfer fee %</label>
              <input type="number" placeholder="0" value={colFee}
                onChange={e => setColFee(e.target.value)} min="0" max="50" step="0.001" />
            </div>
          </div>
          <div className="field">
            <label>Base URI (use {'{i}'} for index)</label>
            <input type="text" placeholder="ipfs://QmCID/{i}.json" value={colBaseUri}
              onChange={e => setColBaseUri(e.target.value)} />
          </div>
          <div className="flags-grid" style={{ marginBottom: 10 }}>
            <Flag label="Burnable"     hint="Issuer can destroy these NFTs."   checked={colBurnable} onChange={setColBurnable} />
            <Flag label="Transferable" hint="NFTs can be transferred to others." checked={colTransfer} onChange={setColTransfer} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={mintCollection}
              disabled={!wallet || nftBatch.ticketLoading || nftBatch.batchLoading || nftBatch.submitLoading}>
              {(nftBatch.ticketLoading || nftBatch.batchLoading || nftBatch.submitLoading)
                ? <><span className="spinner"></span> Minting collection\u2026</>
                : `Mint ${colCount} NFTs in parallel`}
            </button>
            {nftBatch.results.length > 0 && <button className="btn btn-secondary" onClick={nftBatch.reset}>Reset</button>}
          </div>

          <BatchProgress
            ticketLoading={nftBatch.ticketLoading} batchLoading={nftBatch.batchLoading} submitLoading={nftBatch.submitLoading}
            ticketError={nftBatch.ticketError} batchError={nftBatch.batchError} submitError={nftBatch.submitError}
            tickets={nftBatch.tickets} builtBatch={nftBatch.builtBatch} results={nftBatch.results}
          />
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

// ─── MPT panel ──────────────────────────────────────────────────────────────

function MPTPanel() {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()

  // MPTokenIssuanceCreate fields
  const [assetScale,    setAssetScale]    = useState('2')
  const [maxAmount,     setMaxAmount]     = useState('')
  const [transferFee,   setTransferFee]   = useState('0')
  const [metadata,      setMetadata]      = useState('')

  // Mutable flags
  const [tfCanLock,     setTfCanLock]     = useState(false)
  const [tfRequireAuth, setTfRequireAuth] = useState(false)
  const [tfCanEscrow,   setTfCanEscrow]   = useState(false)
  const [tfCanTrade,    setTfCanTrade]    = useState(true)
  const [tfCanTransfer, setTfCanTransfer] = useState(true)
  const [tfCanClawback, setTfCanClawback] = useState(false)

  // Immutable flags
  const [tifCanLock,     setTifCanLock]     = useState(false)
  const [tifRequireAuth, setTifRequireAuth] = useState(false)
  const [tifCanEscrow,   setTifCanEscrow]   = useState(false)
  const [tifCanTrade,    setTifCanTrade]    = useState(false)
  const [tifCanTransfer, setTifCanTransfer] = useState(false)
  const [tifCanClawback, setTifCanClawback] = useState(false)
  const [tifMetadata,    setTifMetadata]    = useState(false)
  const [tifTransferFee, setTifTransferFee] = useState(false)

  // Issuances list
  const [issuances,  setIssuances]  = useState([])
  const [loadingIss, setLoadingIss] = useState(false)

  // Authorize (issuer-side — to pre-approve a holder)
  const [authIssuanceId, setAuthIssuanceId] = useState('')
  const [authHolder,     setAuthHolder]     = useState('')

  // Holder opt-in (holder-side authorize — self-authorize to hold)
  const [optinIssuanceId, setOptinIssuanceId] = useState('')

  // Lock/Unlock
  const [lockIssuanceId, setLockIssuanceId] = useState('')
  const [lockHolder,     setLockHolder]     = useState('')
  const [lockAction,     setLockAction]     = useState('lock')

  // Distribute (issuer sends MPT)
  const [distIssuanceId, setDistIssuanceId] = useState('')
  const [distDest,       setDistDest]       = useState('')
  const [distAmount,     setDistAmount]     = useState('')
  const [distDestTag,    setDistDestTag]    = useState('')

  // Destroy
  const [destroyId, setDestroyId] = useState('')

  const [tab,      setTab]      = useState('create')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [txResult, setTxResult] = useState(null)

  // ── Batch authorize ─────────────────────────────────────────────────────
  const mptBatch        = useTxBatch()
  const [batchIssuanceId, setBatchIssuanceId] = useState('')
  const [holdersList,     setHoldersList]     = useState('')   // newline/comma-separated
  const [batchAmounts,    setBatchAmounts]    = useState('')   // parallel list of amounts

  const runBatchAuthorize = async () => {
    if (!wallet || !batchIssuanceId.trim()) return
    const holders = holdersList.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (holders.length < 2) return
    const txs = holders.map(h => buildAuthorizeMPT({
      account: wallet.address,
      mptIssuanceID: batchIssuanceId.trim(),
      holderAddress: h,
    }))
    const seqs = await mptBatch.createTicketBatch(txs.length)
    if (!seqs) return
    const built = await mptBatch.buildBatch(txs)
    if (!built) return
    await mptBatch.submitBatch()
  }

  const runBatchDistribute = async () => {
    if (!wallet || !batchIssuanceId.trim()) return
    const holders = holdersList.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    const amounts = batchAmounts.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (holders.length < 2) return
    const txs = holders.map((h, i) => buildDistributeMPT({
      account: wallet.address,
      destination: h,
      mptIssuanceID: batchIssuanceId.trim(),
      amount: amounts[i] ?? amounts[0] ?? '1',
    }))
    const seqs = await mptBatch.createTicketBatch(txs.length)
    if (!seqs) return
    const built = await mptBatch.buildBatch(txs)
    if (!built) return
    await mptBatch.submitBatch()
  }

  const fetchIssuances = useCallback(async () => {
    if (!wallet) { setIssuances([]); return }
    setLoadingIss(true)
    try {
      const c = await ensureConnected()
      const r = await c.request({
        command: 'account_objects',
        account: wallet.address,
        type: 'mpt_issuance',
        ledger_index: 'validated',
      })
      setIssuances(r.result.account_objects ?? [])
    } catch (e) { console.error(e); setIssuances([]) }
    finally { setLoadingIss(false) }
  }, [wallet, network, ensureConnected])

  useEffect(() => { if (wallet && tab === 'issuances') fetchIssuances() }, [wallet, tab, fetchIssuances])

  const createIssuance = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      let flags = 0
      if (tfCanLock)     flags |= 0x00000002
      if (tfRequireAuth) flags |= 0x00000004
      if (tfCanEscrow)   flags |= 0x00000008
      if (tfCanTrade)    flags |= 0x00000010
      if (tfCanTransfer) flags |= 0x00000020
      if (tfCanClawback) flags |= 0x00000040

      let immFlags = 0
      if (tifCanLock)     immFlags |= 0x00000002
      if (tifRequireAuth) immFlags |= 0x00000004
      if (tifCanEscrow)   immFlags |= 0x00000008
      if (tifCanTrade)    immFlags |= 0x00000010
      if (tifCanTransfer) immFlags |= 0x00000020
      if (tifCanClawback) immFlags |= 0x00000040
      if (tifMetadata)    immFlags |= 0x00010000
      if (tifTransferFee) immFlags |= 0x00020000

      const tx = {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: wallet.address,
        Flags: flags,
        AssetScale: Number(assetScale),
      }
      const tfRaw = Math.round(Number(transferFee) * 1000)
      if (tfRaw > 0) tx.TransferFee = tfRaw
      if (maxAmount.trim()) tx.MaximumAmount = maxAmount.trim()
      if (metadata.trim())  tx.MPTokenMetadata = toHex(metadata.trim())
      if (immFlags > 0)     tx.ImmutableFlags = immFlags

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenIssuanceCreate', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchIssuances, 2500)
    } catch (e) { setError('Create failed: ' + e.message) }
    finally { setLoading(false) }
  }

  // Issuer pre-authorizes a holder (required when tfRequireAuth is set)
  const authorizeHolder = async () => {
    if (!wallet || !authIssuanceId.trim() || !authHolder.trim()) {
      setError('Issuance ID and holder address required.'); return
    }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'MPTokenAuthorize',
        Account: wallet.address,
        MPTokenIssuanceID: authIssuanceId.trim(),
        Holder: authHolder.trim(),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenAuthorize (Issuer)', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Authorize failed: ' + e.message) }
    finally { setLoading(false) }
  }

  // Holder opts in to hold an MPT (no Holder field = self-authorize)
  const holderOptIn = async () => {
    if (!wallet || !optinIssuanceId.trim()) {
      setError('Issuance ID required.'); return
    }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'MPTokenAuthorize',
        Account: wallet.address,
        MPTokenIssuanceID: optinIssuanceId.trim(),
        // No Holder field — this is a self-authorize (opt-in as holder)
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenAuthorize (Opt-in)', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Opt-in failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const setLockState = async () => {
    if (!wallet || !lockIssuanceId.trim()) { setError('Issuance ID required.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'MPTokenIssuanceSet',
        Account: wallet.address,
        MPTokenIssuanceID: lockIssuanceId.trim(),
        Flags: lockAction === 'lock' ? 1 : 2, // tfMPTLock=1, tfMPTUnlock=2
      }
      if (lockHolder.trim()) tx.Holder = lockHolder.trim()
      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenIssuanceSet (' + lockAction + ')', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('Lock/Unlock failed: ' + e.message) }
    finally { setLoading(false) }
  }

  // Issuer distributes MPT to a holder (Payment with mpt_issuance_id amount)
  const distribute = async () => {
    if (!wallet || !distIssuanceId.trim() || !distDest.trim() || !distAmount) {
      setError('Issuance ID, destination, and amount required.'); return
    }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'Payment',
        Account: wallet.address,
        Destination: distDest.trim(),
        Amount: {
          mpt_issuance_id: distIssuanceId.trim(),
          value: distAmount,
        },
      }
      if (distDestTag) tx.DestinationTag = Number(distDestTag)
      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPT Payment', status: ok ? 'success' : 'error', amount: distAmount, hash: result.result.hash })
    } catch (e) { setError('Distribute failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const destroyIssuance = async () => {
    if (!wallet || !destroyId.trim()) { setError('Issuance ID required.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'MPTokenIssuanceDestroy',
        Account: wallet.address,
        MPTokenIssuanceID: destroyId.trim(),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenIssuanceDestroy', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchIssuances, 2500)
    } catch (e) { setError('Destroy failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const MPT_TABS = [
    ['create', 'Create'], ['authorize', 'Auth Holder'], ['optin', 'Opt-in'],
    ['lock', 'Lock / Unlock'], ['distribute', 'Distribute'], ['destroy', 'Destroy'], ['issuances', 'My Issuances'],
    ['batch', 'Batch Ops']
  ]

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
      {error   && <div className="alert alert-danger">{error}</div>}

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
          {MPT_TABS.map(([k, l]) => (
            <button key={k} className={'tab-btn' + (tab === k ? ' tab-btn-active' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'create' && (
        <div className="glass-card fade-in">
          <div className="section-title">Create MPT issuance</div>
          <p className="muted">Defines a new Multi-Purpose Token. Mutable flags can be changed later; immutable flags are locked forever.</p>

          <div className="subsection-label">Mutable flags (can be toggled after creation)</div>
          <div className="flags-grid">
            <Flag label="Can Lock"     hint="Issuer can lock individual or all holders."                    checked={tfCanLock}     onChange={setTfCanLock} />
            <Flag label="Require Auth" hint="Holders must be authorized before receiving tokens."           checked={tfRequireAuth} onChange={setTfRequireAuth} />
            <Flag label="Can Escrow"   hint="Holders can place their balances into escrow."                 checked={tfCanEscrow}   onChange={setTfCanEscrow} />
            <Flag label="Can Trade"    hint="Holders can trade balances on the XRPL DEX."                  checked={tfCanTrade}    onChange={setTfCanTrade} />
            <Flag label="Can Transfer" hint="Tokens can be transferred to accounts other than the issuer." checked={tfCanTransfer} onChange={setTfCanTransfer} />
            <Flag label="Can Clawback" hint="Issuer can claw back tokens from individual holders."         checked={tfCanClawback} onChange={setTfCanClawback} />
          </div>

          <div className="subsection-label" style={{ marginTop: 10 }}>Immutable flags (permanent — choose carefully)</div>
          <div className="flags-grid">
            <Flag label="Lock immutable"         hint="The Can Lock flag can never be changed."          checked={tifCanLock}     onChange={setTifCanLock} />
            <Flag label="Require Auth immutable" hint="The Require Auth flag can never be changed."      checked={tifRequireAuth} onChange={setTifRequireAuth} />
            <Flag label="Escrow immutable"       hint="The Can Escrow flag can never be changed."        checked={tifCanEscrow}   onChange={setTifCanEscrow} />
            <Flag label="Trade immutable"        hint="The Can Trade flag can never be changed."         checked={tifCanTrade}    onChange={setTifCanTrade} />
            <Flag label="Transfer immutable"     hint="The Can Transfer flag can never be changed."      checked={tifCanTransfer} onChange={setTifCanTransfer} />
            <Flag label="Clawback immutable"     hint="The Can Clawback flag can never be changed."      checked={tifCanClawback} onChange={setTifCanClawback} />
            <Flag label="Metadata immutable"     hint="MPTokenMetadata can never be modified."           checked={tifMetadata}    onChange={setTifMetadata} />
            <Flag label="Transfer fee immutable" hint="TransferFee can never be modified."               checked={tifTransferFee} onChange={setTifTransferFee} />
          </div>

          <div className="field-row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Asset scale (decimal places, 0–255)</label>
              <input type="number" placeholder="2" value={assetScale}
                onChange={e => setAssetScale(e.target.value)} min="0" max="255" />
            </div>
            <div className="field">
              <label>Transfer fee % (0–50)</label>
              <input type="number" placeholder="0" value={transferFee}
                onChange={e => setTransferFee(e.target.value)} min="0" max="50" step="0.001" />
            </div>
          </div>
          <div className="field">
            <label>Max supply (optional uint64 string)</label>
            <input type="text" placeholder="e.g. 9223372036854775807" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Metadata (JSON or text, hex-encoded on-chain)</label>
            <textarea rows={3} placeholder='{"name":"My Token","description":"..."}' value={metadata}
              onChange={e => setMetadata(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={createIssuance} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Creating…</> : 'Create issuance'}
          </button>
        </div>
      )}

      {tab === 'authorize' && (
        <div className="glass-card fade-in">
          <div className="section-title">Authorize holder (issuer-side)</div>
          <p className="muted">Pre-approve a specific holder to receive tokens when <code>tfRequireAuth</code> is active. The issuer sends this transaction.</p>
          <div className="field">
            <label>MPT Issuance ID</label>
            <input type="text" placeholder="0000… hex" value={authIssuanceId} onChange={e => setAuthIssuanceId(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Holder address to authorize</label>
            <input type="text" placeholder="r…" value={authHolder} onChange={e => setAuthHolder(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={authorizeHolder} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Authorizing…</> : 'Authorize holder'}
          </button>
        </div>
      )}

      {tab === 'optin' && (
        <div className="glass-card fade-in">
          <div className="section-title">Opt-in as holder</div>
          <p className="muted">A holder account opts in to hold an MPT by calling MPTokenAuthorize without a Holder field. Required before you can receive MPT balances.</p>
          <div className="field">
            <label>MPT Issuance ID</label>
            <input type="text" placeholder="0000… hex" value={optinIssuanceId} onChange={e => setOptinIssuanceId(e.target.value)} className="mono" />
          </div>
          <button className="btn btn-primary btn-full" onClick={holderOptIn} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Opting in…</> : 'Opt in to hold MPT'}
          </button>
        </div>
      )}

      {tab === 'lock' && (
        <div className="glass-card fade-in">
          <div className="section-title">Lock / Unlock</div>
          <p className="muted">Lock a specific holder (or all holders if blank) from transferring their MPT balance. Requires <code>tfCanLock</code>.</p>
          <div className="field">
            <label>MPT Issuance ID</label>
            <input type="text" placeholder="0000… hex" value={lockIssuanceId} onChange={e => setLockIssuanceId(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Holder (blank = global lock/unlock)</label>
            <input type="text" placeholder="r… or leave blank" value={lockHolder} onChange={e => setLockHolder(e.target.value)} />
          </div>
          <div className="field">
            <label>Action</label>
            <select value={lockAction} onChange={e => setLockAction(e.target.value)}>
              <option value="lock">Lock</option>
              <option value="unlock">Unlock</option>
            </select>
          </div>
          <button className="btn btn-primary btn-full" onClick={setLockState} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Applying…</> : lockAction === 'lock' ? 'Lock' : 'Unlock'}
          </button>
        </div>
      )}

      {tab === 'distribute' && (
        <div className="glass-card fade-in">
          <div className="section-title">Distribute MPT</div>
          <p className="muted">Send MPT tokens from the issuer to a holder who has already opted in. Uses a standard Payment transaction with an MPT amount.</p>
          <div className="field">
            <label>MPT Issuance ID</label>
            <input type="text" placeholder="0000… hex" value={distIssuanceId} onChange={e => setDistIssuanceId(e.target.value)} className="mono" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Amount</label>
              <input type="number" placeholder="100" value={distAmount} onChange={e => setDistAmount(e.target.value)} min="0" step="any" />
            </div>
            <div className="field">
              <label>Destination tag</label>
              <input type="number" placeholder="Optional" value={distDestTag} onChange={e => setDistDestTag(e.target.value)} min="0" />
            </div>
          </div>
          <div className="field">
            <label>Recipient (must have opted in)</label>
            <input type="text" placeholder="r…" value={distDest} onChange={e => setDistDest(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={distribute} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Sending…</> : 'Distribute MPT'}
          </button>
        </div>
      )}

      {tab === 'destroy' && (
        <div className="glass-card fade-in">
          <div className="section-title">Destroy issuance</div>
          <div className="alert alert-warning" style={{ marginBottom: 10 }}>
            All outstanding tokens must be returned to the issuer first (zero circulating supply). The issuance object will be deleted and the owner reserve freed.
          </div>
          <div className="field">
            <label>MPT Issuance ID</label>
            <input type="text" placeholder="0000… hex" value={destroyId} onChange={e => setDestroyId(e.target.value)} className="mono" />
          </div>
          <button className="btn btn-danger btn-full" onClick={destroyIssuance} disabled={loading || !wallet}>
            {loading ? <><span className="spinner"></span> Destroying…</> : 'Destroy issuance'}
          </button>
        </div>
      )}

      {tab === 'issuances' && (
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>My issuances</div>
            <button className="btn btn-secondary btn-sm" onClick={fetchIssuances} disabled={loadingIss}>
              {loadingIss ? <span className="spinner"></span> : 'Refresh'}
            </button>
          </div>
          {!wallet ? (
            <div className="muted">Open a book to view issuances.</div>
          ) : issuances.length === 0 ? (
            <div className="muted" style={{ margin: 0 }}>{loadingIss ? 'Loading…' : 'No issuances yet.'}</div>
          ) : (
            <div className="table-scroll"><table className="data-table">
              <thead>
                <tr><th>Issuance ID</th><th>Scale</th><th>Max supply</th><th>Flags</th><th></th></tr>
              </thead>
              <tbody>
                {issuances.map((iss, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: '0.65rem' }}>{iss.MPTokenIssuanceID?.slice(0, 10)}…</td>
                    <td>{iss.AssetScale}</td>
                    <td className="mono">{iss.MaximumAmount ?? '∞'}</td>
                    <td className="mono">0x{iss.Flags?.toString(16).padStart(8, '0')}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setAuthIssuanceId(iss.MPTokenIssuanceID)
                          setLockIssuanceId(iss.MPTokenIssuanceID)
                          setDistIssuanceId(iss.MPTokenIssuanceID)
                          setDestroyId(iss.MPTokenIssuanceID)
                          setOptinIssuanceId(iss.MPTokenIssuanceID)
                          setTab('distribute')
                        }}>
                        Use
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'batch' && (
        <div className="glass-card fade-in">
          <div className="section-title">Batch MPT operations</div>
          <p className="muted">Authorize or distribute to multiple holders in parallel using XRPL Tickets.</p>

          {!wallet && <div className="alert alert-warning">Open a book first.</div>}

          <div className="field">
            <label>MPT Issuance ID</label>
            <input type="text" placeholder="0000\u2026 hex" value={batchIssuanceId}
              onChange={e => setBatchIssuanceId(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Holder addresses (one per line or comma-separated, min 2)</label>
            <textarea rows={5} placeholder={'r\u2026\nr\u2026\nr\u2026'} value={holdersList}
              onChange={e => setHoldersList(e.target.value)} className="mono" />
          </div>
          <div className="field">
            <label>Amounts for distribution (one per line matching holders, or single value for all)</label>
            <textarea rows={3} placeholder={'100\n250\n50'} value={batchAmounts}
              onChange={e => setBatchAmounts(e.target.value)} className="mono" />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={runBatchAuthorize}
              disabled={!wallet || mptBatch.ticketLoading || mptBatch.batchLoading || mptBatch.submitLoading}>
              {(mptBatch.ticketLoading || mptBatch.batchLoading || mptBatch.submitLoading)
                ? <><span className="spinner"></span> Running\u2026</>
                : 'Batch authorize holders'}
            </button>
            <button className="btn btn-primary" onClick={runBatchDistribute}
              disabled={!wallet || mptBatch.ticketLoading || mptBatch.batchLoading || mptBatch.submitLoading}>
              {(mptBatch.ticketLoading || mptBatch.batchLoading || mptBatch.submitLoading)
                ? <><span className="spinner"></span> Running\u2026</>
                : 'Batch distribute MPT'}
            </button>
            {mptBatch.results.length > 0 && <button className="btn btn-secondary" onClick={mptBatch.reset}>Reset</button>}
          </div>

          <BatchProgress
            ticketLoading={mptBatch.ticketLoading} batchLoading={mptBatch.batchLoading} submitLoading={mptBatch.submitLoading}
            ticketError={mptBatch.ticketError} batchError={mptBatch.batchError} submitError={mptBatch.submitError}
            tickets={mptBatch.tickets} builtBatch={mptBatch.builtBatch} results={mptBatch.results}
          />
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

// ─── Page shell ─────────────────────────────────────────────────────────────

const TOKEN_TYPES = [
  { key: 'FT',  label: 'FT',  sub: 'Fungible Token'        },
  { key: 'NFT', label: 'NFT', sub: 'Non-Fungible Token'     },
  { key: 'MPT', label: 'MPT', sub: 'Multi-Purpose Token'    },
]

export default function IssuePage() {
  const [tokenType, setTokenType] = useState('FT')
  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Issue</div>
        <h2>Mint. Issue. Control.</h2>
        <p>Full lifecycle management for every token standard on the XRP Ledger — fungible, non-fungible, and multi-purpose.</p>
      </div>

      <div className="glass-card" style={{ marginBottom: 10 }}>
        <div className="token-type-bar">
          {TOKEN_TYPES.map(t => (
            <button
              key={t.key}
              className={'token-type-btn' + (tokenType === t.key ? ' token-type-btn-active' : '')}
              onClick={() => setTokenType(t.key)}
            >
              <span className="token-type-label">{t.label}</span>
              <span className="token-type-sub">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div>
          {tokenType === 'FT'  && <FTPanel />}
          {tokenType === 'NFT' && <NFTPanel />}
          {tokenType === 'MPT' && <MPTPanel />}
        </div>
        <div className="flow">
          <WalletCard />
        </div>
      </div>
    </div>
  )
}
