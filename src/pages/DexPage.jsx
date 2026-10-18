import { useState, useEffect, useCallback } from 'react'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxModal from '../components/TxModal'
import TokenSelect from '../components/TokenSelect'
import { useTxBatch } from '../hooks/transactions/useTxBatch'
import { buildCreateOffer } from '../services/DexService'
import BatchProgress from '../components/BatchProgress'
import { amountOf, defaultTokenId, tokenById } from '../lib/tokens'

function AmountPanel({ title, network, amount, setAmount, tokenId, setTokenId }) {
  return (
    <div className="glass-card">
      <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        {title}
      </div>
      <div className="field-row">
        <div className="field">
          <label>Amount</label>
          <input type="number" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} min="0" step="any" />
        </div>
        <TokenSelect network={network} tokenId={tokenId} onChange={token => setTokenId(token.id)} />
      </div>
    </div>
  )
}

export default function DexPage() {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()
  const [tab, setTab] = useState('offer')

  const [getsAmt, setGetsAmt] = useState('')
  const [getsId, setGetsId]   = useState('XRP')
  const [paysAmt, setPaysAmt] = useState('')
  const [paysId, setPaysId]   = useState(() => defaultTokenId(network, { allowXrp: false }) || 'XRP')

  const [offers,        setOffers]        = useState([])
  const [loadingOffers, setLoadingOffers] = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [txResult,      setTxResult]      = useState(null)

  // ── Batch state ──────────────────────────────────────────────────────────
  const batch = useTxBatch()
  const blankOrder = () => ({
    getsAmt: '',
    getsId: 'XRP',
    paysAmt: '',
    paysId: defaultTokenId(network, { allowXrp: false }) || 'XRP',
  })
  const [batchRows, setBatchRows] = useState(() => [blankOrder(), blankOrder()])
  const updateBatchRow = (i, field, val) =>
    setBatchRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const addBatchRow    = () => setBatchRows(prev =>
    prev.length < 50 ? [...prev, blankOrder()] : prev)
  const removeBatchRow = (i) => setBatchRows(prev => prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev)

  const runBatchOffers = async () => {
    if (!wallet) return
    const txs = batchRows.map(r => buildCreateOffer({
      account: wallet.address,
      takerGets: amountOf(xrpl, tokenById(network, r.getsId), r.getsAmt),
      takerPays: amountOf(xrpl, tokenById(network, r.paysId), r.paysAmt),
    }))
    const seqs = await batch.createTicketBatch(txs.length)
    if (!seqs) return
    const built = await batch.buildBatch(txs)
    if (!built) return
    await batch.submitBatch()
  }

  const createOffer = async () => {
    const gets = tokenById(network, getsId)
    const pays = tokenById(network, paysId)
    if (!wallet)            { setError('Open a book first — Bank tab.'); return }
    if (!getsAmt || !paysAmt) { setError('Fill both sides of the order.'); return }
    if (!gets || !pays)     { setError('Pick both assets from the directory.'); return }

    setLoading(true); setError(''); setTxResult(null)
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'OfferCreate',
        Account: wallet.address,
        TakerGets: amountOf(xrpl, gets, getsAmt),
        TakerPays: amountOf(xrpl, pays, paysAmt),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({
        type: 'OfferCreate',
        status: ok ? 'success' : 'error',
        amount: getsAmt + ' ' + gets.code + ' -> ' + paysAmt + ' ' + pays.code,
        hash: result.result.hash,
      })
      if (ok) { setTimeout(fetchOffers, 2500); setTab('offers') }
    } catch (e) { setError('Order didn\u2019t place: ' + e.message) }
    finally { setLoading(false) }
  }

  const fetchOffers = useCallback(async () => {
    if (!wallet) return
    setLoadingOffers(true)
    try {
      const c = await ensureConnected()
      const r = await c.request({ command: 'account_offers', account: wallet.address, ledger_index: 'validated' })
      setOffers(r.result.offers || [])
    } catch (e) { console.error(e) }
    finally { setLoadingOffers(false) }
  }, [wallet, ensureConnected])

  const cancelOffer = async (seq) => {
    if (!wallet) return
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'OfferCancel',
        Account: wallet.address,
        OfferSequence: seq,
      }, { wallet: w })
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'OfferCancel', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchOffers, 2500)
    } catch (e) { setError('Cancel failed: ' + e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (wallet && tab === 'offers') fetchOffers() }, [wallet, tab, fetchOffers])

  const fmtAmt = (a) =>
    typeof a === 'string'
      ? (Number(a) / 1e6).toFixed(6) + ' XRP'
      : a.value + ' ' + a.currency

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Invest</div>
        <h2>Markets without the middle.</h2>
        <p>Place an order on the on-ledger exchange. Best available fill first — the rest stays working for you.</p>
      </div>

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar">
          <button className={'tab-btn' + (tab === 'offer'  ? ' tab-btn-active' : '')} onClick={() => setTab('offer')}>
            New order
          </button>
          <button className={'tab-btn' + (tab === 'offers' ? ' tab-btn-active' : '')}
            onClick={() => { setTab('offers'); fetchOffers() }}>
            Open orders
          </button>
          <button className={'tab-btn' + (tab === 'batch' ? ' tab-btn-active' : '')} onClick={() => { setTab('batch'); batch.reset() }}>
            Batch orders
          </button>
        </div>
      </div>

      {tab === 'offer' && (
        <div className="grid-2" style={{ marginTop: 10 }}>
          <div className="flow">
            {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
            {error   && <div className="alert alert-danger">{error}</div>}
            <AmountPanel title="You sell" network={network}
              amount={getsAmt} setAmount={setGetsAmt}
              tokenId={getsId} setTokenId={setGetsId}
            />
            <div className="swap-mark">⇅</div>
            <AmountPanel title="You buy" network={network}
              amount={paysAmt} setAmount={setPaysAmt}
              tokenId={paysId} setTokenId={setPaysId}
            />
            <button className="btn btn-primary btn-full"
              onClick={createOffer} disabled={loading || !wallet}>
              {loading ? (<><span className="spinner"></span> Placing…</>) : 'Place order'}
            </button>
          </div>

          <div className="flow">
            <WalletCard />
            <div className="glass-card">
              <div className="section-title">How it fills</div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Crossing orders match instantly. What&apos;s left sits as a standing order until you cancel or it completes. Network fee only.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'offers' && (
        <div className="glass-card fade-in" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Open orders</div>
            <button className="btn btn-secondary btn-sm" onClick={fetchOffers} disabled={loadingOffers}>
              {loadingOffers ? <span className="spinner"></span> : 'Refresh'}
            </button>
          </div>
          {!wallet ? (
            <div className="alert alert-warning">Open a book to see orders.</div>
          ) : offers.length === 0 ? (
            <div className="muted" style={{ margin: 0 }}>
              {loadingOffers ? 'Loading\u2026' : 'No open orders. Place one and stay in the flow.'}
            </div>
          ) : (
            <div className="table-scroll"><table className="data-table">
              <thead>
                <tr><th>Seq</th><th>Sell</th><th>Buy</th><th>Quality</th><th></th></tr>
              </thead>
              <tbody>
                {offers.map((o, i) => (
                  <tr key={i}>
                    <td className="mono">#{o.seq}</td>
                    <td>{fmtAmt(o.taker_gets)}</td>
                    <td>{fmtAmt(o.taker_pays)}</td>
                    <td className="mono">{Number(o.quality).toExponential(4)}</td>
                    <td>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => cancelOffer(o.seq)} disabled={loading}>
                        Cancel
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
        <div className="fade-in" style={{ marginTop: 10 }}>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <div className="section-title">Batch order creation</div>
            <p className="muted">Create multiple orders in parallel using XRPL Tickets. All submitted simultaneously — no waiting between orders.</p>
          </div>

          {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}

          {batchRows.map((r, i) => (
            <div key={i} className="glass-card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="badge badge-devnet">Order {i + 1}</span>
                {batchRows.length > 2 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => removeBatchRow(i)}>\u2715</button>
                )}
              </div>
              <div className="field-row">
                <div className="field"><label>Sell amount</label>
                  <input type="number" placeholder="0" value={r.getsAmt} onChange={e => updateBatchRow(i, 'getsAmt', e.target.value)} min="0" step="any" />
                </div>
                <TokenSelect network={network} tokenId={r.getsId} label="Sell asset" onChange={token => updateBatchRow(i, 'getsId', token.id)} />
                <div className="field"><label>Buy amount</label>
                  <input type="number" placeholder="0" value={r.paysAmt} onChange={e => updateBatchRow(i, 'paysAmt', e.target.value)} min="0" step="any" />
                </div>
                <TokenSelect network={network} tokenId={r.paysId} label="Buy asset" onChange={token => updateBatchRow(i, 'paysId', token.id)} />
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-secondary" onClick={addBatchRow} disabled={batchRows.length >= 50}>+ Add order</button>
            <button className="btn btn-primary" onClick={runBatchOffers}
              disabled={!wallet || batch.ticketLoading || batch.batchLoading || batch.submitLoading}>
              {(batch.ticketLoading || batch.batchLoading || batch.submitLoading)
                ? <><span className="spinner"></span> Running batch\u2026</>
                : `Submit ${batchRows.length} orders in parallel`}
            </button>
            {batch.results.length > 0 && <button className="btn btn-secondary" onClick={batch.reset}>Reset</button>}
          </div>

          <BatchProgress
            ticketLoading={batch.ticketLoading} batchLoading={batch.batchLoading} submitLoading={batch.submitLoading}
            ticketError={batch.ticketError} batchError={batch.batchError} submitError={batch.submitError}
            tickets={batch.tickets} builtBatch={batch.builtBatch} results={batch.results}
          />
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}
