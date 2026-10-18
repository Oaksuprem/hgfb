/**
 * OraclePage — On-Ledger Price Oracles
 * Covers the full XLS-47 Oracle lifecycle:
 *   OracleSet    — create or update a price oracle
 *   OracleDelete — remove an oracle object
 *   get_aggregate_price — query the median/trimmed-mean of multiple oracle feeds
 */

import { useState, useCallback } from 'react'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxModal from '../components/TxModal'

// ─── helpers ────────────────────────────────────────────────────────────────

function toHex(str) {
  if (!str) return ''
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** Current Ripple epoch time (seconds since 2000-01-01) */
function nowRipple() {
  return Math.floor(Date.now() / 1000) - 946684800
}

// ─── OracleSet panel ────────────────────────────────────────────────────────

function OracleSetPanel() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  // Identity
  const [oracleDocId,   setOracleDocId]   = useState('1')       // uint32 document ID
  const [provider,      setProvider]      = useState('')         // hex-encoded provider name
  const [uri,           setUri]           = useState('')         // URI of source data
  const [assetClass,    setAssetClass]    = useState('currency') // hex-encoded asset class

  // LastUpdateTime — default to now (can be overridden)
  const [useNow,        setUseNow]        = useState(true)
  const [customTime,    setCustomTime]    = useState('')

  // PriceDataSeries — array of { baseAsset, quoteAsset, assetPrice, scale }
  const [priceRows, setPriceRows] = useState([
    { baseAsset: 'XRP', quoteAsset: 'USD', assetPrice: '', scale: '6' },
  ])

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [txResult, setTxResult] = useState(null)

  const addRow = () =>
    setPriceRows(r => [...r, { baseAsset: '', quoteAsset: '', assetPrice: '', scale: '6' }])

  const removeRow = (i) =>
    setPriceRows(r => r.filter((_, idx) => idx !== i))

  const updateRow = (i, field, val) =>
    setPriceRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  const submit = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    if (!provider.trim()) { setError('Provider name required.'); return }
    const validRows = priceRows.filter(r => r.baseAsset && r.quoteAsset && r.assetPrice)
    if (validRows.length === 0) { setError('At least one complete price data entry required.'); return }

    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)

      const lastUpdateTime = useNow
        ? nowRipple()
        : Math.floor(new Date(customTime).getTime() / 1000) - 946684800

      const tx = {
        TransactionType: 'OracleSet',
        Account: wallet.address,
        OracleDocumentID: Number(oracleDocId),
        Provider: toHex(provider.trim()),
        LastUpdateTime: lastUpdateTime,
        PriceDataSeries: validRows.map(r => ({
          PriceData: {
            BaseAsset:  toHex(r.baseAsset.trim()),
            QuoteAsset: toHex(r.quoteAsset.trim()),
            AssetPrice: r.assetPrice, // uint64 as string
            Scale:      Number(r.scale),
          },
        })),
      }
      if (uri.trim())        tx.URI         = toHex(uri.trim())
      if (assetClass.trim()) tx.AssetClass  = toHex(assetClass.trim())

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'OracleSet', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('OracleSet failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
      {error   && <div className="alert alert-danger">{error}</div>}

      <div className="glass-card">
        <div className="section-title">Oracle identity</div>
        <p className="muted">
          An oracle object is identified by its <code>Account</code> + <code>OracleDocumentID</code> pair.
          Sending OracleSet for an existing ID updates it; a new ID creates it.
        </p>

        <div className="field-row">
          <div className="field">
            <label>Oracle document ID (uint32)</label>
            <input type="number" placeholder="1" value={oracleDocId}
              onChange={e => setOracleDocId(e.target.value)} min="0" />
          </div>
          <div className="field">
            <label>Asset class (e.g. currency, commodity)</label>
            <input type="text" placeholder="currency" value={assetClass}
              onChange={e => setAssetClass(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Provider (free-form name, stored as hex)</label>
          <input type="text" placeholder="e.g. Chainlink, Band, custom-feed" value={provider}
            onChange={e => setProvider(e.target.value)} />
        </div>
        <div className="field">
          <label>URI (link to source data, optional)</label>
          <input type="text" placeholder="https://… or ipfs://…" value={uri}
            onChange={e => setUri(e.target.value)} />
        </div>

        <div className="field">
          <label>LastUpdateTime</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="flag-row" style={{ marginBottom: 0, flex: 'none' }}>
              <input type="checkbox" checked={useNow} onChange={e => setUseNow(e.target.checked)} />
              <span className="flag-label">Use current time</span>
            </label>
            {!useNow && (
              <input type="datetime-local" value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                style={{ flex: 1, background: 'rgba(255,247,237,.04)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r1)', color: 'var(--txt)', fontFamily: 'inherit',
                  fontSize: '0.84rem', padding: '8px 11px' }} />
            )}
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Price data series</div>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add pair</button>
        </div>
        <p className="muted">
          Each entry defines a base/quote pair and its current price. <code>AssetPrice</code> is an integer;
          the actual price = AssetPrice × 10<sup>−Scale</sup>.
          E.g. price 6543210 at scale 6 = $6.54321.
        </p>

        {priceRows.map((row, i) => (
          <div key={i} className="oracle-price-row">
            <div className="field-row">
              <div className="field">
                <label>Base asset (e.g. XRP)</label>
                <input type="text" placeholder="XRP" value={row.baseAsset}
                  onChange={e => updateRow(i, 'baseAsset', e.target.value)} />
              </div>
              <div className="field">
                <label>Quote asset (e.g. USD)</label>
                <input type="text" placeholder="USD" value={row.quoteAsset}
                  onChange={e => updateRow(i, 'quoteAsset', e.target.value)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Asset price (integer)</label>
                <input type="text" placeholder="e.g. 6543210" value={row.assetPrice}
                  onChange={e => updateRow(i, 'assetPrice', e.target.value)} className="mono" />
              </div>
              <div className="field">
                <label>Scale (decimal places, 0–10)</label>
                <input type="number" placeholder="6" value={row.scale}
                  onChange={e => updateRow(i, 'scale', e.target.value)} min="0" max="10" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}>
                {priceRows.length > 1 && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>✕</button>
                )}
              </div>
            </div>
            {row.assetPrice && row.scale && (
              <div className="oracle-price-preview">
                ≈ {(Number(row.assetPrice) * Math.pow(10, -Number(row.scale))).toPrecision(8)} {row.quoteAsset || '?'} per {row.baseAsset || '?'}
              </div>
            )}
            {i < priceRows.length - 1 && <hr className="divider" />}
          </div>
        ))}

        <button className="btn btn-primary btn-full" style={{ marginTop: 8 }}
          onClick={submit} disabled={loading || !wallet}>
          {loading ? <><span className="spinner"></span> Submitting…</> : 'Create / Update oracle'}
        </button>
      </div>

      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

// ─── OracleDelete panel ──────────────────────────────────────────────────────

function OracleDeletePanel() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [oracleDocId, setOracleDocId] = useState('1')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [txResult,    setTxResult]    = useState(null)

  const deleteOracle = async () => {
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'OracleDelete',
        Account: wallet.address,
        OracleDocumentID: Number(oracleDocId),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'OracleDelete', status: ok ? 'success' : 'error', hash: result.result.hash })
    } catch (e) { setError('OracleDelete failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
      {error   && <div className="alert alert-danger">{error}</div>}

      <div className="glass-card">
        <div className="section-title">Delete oracle</div>
        <p className="muted">
          Permanently removes the oracle object from the ledger. The owner reserve (2 XRP) is freed.
          Only the oracle's creator account can delete it.
        </p>
        <div className="field">
          <label>Oracle document ID</label>
          <input type="number" placeholder="1" value={oracleDocId}
            onChange={e => setOracleDocId(e.target.value)} min="0" />
        </div>
        <button className="btn btn-danger btn-full" onClick={deleteOracle} disabled={loading || !wallet}>
          {loading ? <><span className="spinner"></span> Deleting…</> : 'Delete oracle'}
        </button>
      </div>

      {txResult && <TxModal tx={txResult} onClose={() => { setTxResult(null); setError('') }} />}
    </div>
  )
}

// ─── Aggregate Price panel ───────────────────────────────────────────────────

function AggregatePricePanel() {
  const { ensureConnected } = useXrpl()

  // Oracles list: each entry is { account, oracleDocumentId }
  const [oracleList, setOracleList] = useState([
    { account: '', oracleDocumentId: '1' },
  ])
  const [baseAsset,  setBaseAsset]  = useState('XRP')
  const [quoteAsset, setQuoteAsset] = useState('USD')
  const [trim,       setTrim]       = useState('20') // percentage of outliers to trim

  const [result,     setResult]     = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const addOracle = () =>
    setOracleList(l => [...l, { account: '', oracleDocumentId: '1' }])

  const removeOracle = (i) =>
    setOracleList(l => l.filter((_, idx) => idx !== i))

  const updateOracle = (i, field, val) =>
    setOracleList(l => l.map((o, idx) => idx === i ? { ...o, [field]: val } : o))

  const toHexAsset = s => Array.from(new TextEncoder().encode(s))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

  const query = useCallback(async () => {
    const validOracles = oracleList.filter(o => o.account.trim())
    if (validOracles.length === 0) { setError('At least one oracle account required.'); return }
    if (!baseAsset.trim() || !quoteAsset.trim()) { setError('Base and quote asset required.'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const c = await ensureConnected()
      const r = await c.request({
        command: 'get_aggregate_price',
        base_asset:  toHexAsset(baseAsset.trim()),
        quote_asset: toHexAsset(quoteAsset.trim()),
        oracles: validOracles.map(o => ({
          account: o.account.trim(),
          oracle_document_id: Number(o.oracleDocumentId),
        })),
        trim: Number(trim),
      })
      setResult(r.result)
    } catch (e) { setError('get_aggregate_price failed: ' + e.message) }
    finally { setLoading(false) }
  }, [oracleList, baseAsset, quoteAsset, trim, ensureConnected])

  const fmtPrice = (stats) => {
    if (!stats) return '—'
    const val = stats.mean ?? stats.median ?? stats.trimmed_mean
    if (!val) return '—'
    return (Number(val.value) * Math.pow(10, -Number(val.scale ?? 0))).toPrecision(8)
  }

  return (
    <div className="flow">
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="glass-card">
        <div className="section-title">Aggregate price query</div>
        <p className="muted">
          Queries the median / trimmed-mean price from multiple oracle feeds for a given asset pair.
          Uses the <code>get_aggregate_price</code> RPC command — no transaction required.
        </p>

        <div className="field-row">
          <div className="field">
            <label>Base asset (e.g. XRP)</label>
            <input type="text" placeholder="XRP" value={baseAsset} onChange={e => setBaseAsset(e.target.value)} />
          </div>
          <div className="field">
            <label>Quote asset (e.g. USD)</label>
            <input type="text" placeholder="USD" value={quoteAsset} onChange={e => setQuoteAsset(e.target.value)} />
          </div>
          <div className="field">
            <label>Trim % (outlier removal, 0–25)</label>
            <input type="number" placeholder="20" value={trim}
              onChange={e => setTrim(e.target.value)} min="0" max="25" />
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Oracle sources</div>
          <button className="btn btn-secondary btn-sm" onClick={addOracle}>+ Add oracle</button>
        </div>

        {oracleList.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
            <div className="field" style={{ flex: 2, marginBottom: 0 }}>
              <label>Oracle account</label>
              <input type="text" placeholder="r…" value={o.account}
                onChange={e => updateOracle(i, 'account', e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Doc ID</label>
              <input type="number" placeholder="1" value={o.oracleDocumentId}
                onChange={e => updateOracle(i, 'oracleDocumentId', e.target.value)} min="0" />
            </div>
            {oracleList.length > 1 && (
              <button className="btn btn-danger btn-sm" onClick={() => removeOracle(i)}
                style={{ marginBottom: 0, flexShrink: 0 }}>✕</button>
            )}
          </div>
        ))}

        <button className="btn btn-primary btn-full" style={{ marginTop: 4 }}
          onClick={query} disabled={loading}>
          {loading ? <><span className="spinner"></span> Querying…</> : 'Get aggregate price'}
        </button>
      </div>

      {result && (
        <div className="glass-card fade-in">
          <div className="section-title">Result</div>

          <div className="table-scroll"><table className="data-table">
            <tbody>
              {result.entire_set && (
                <>
                  <tr>
                    <td className="amm-info-label">Mean (all)</td>
                    <td className="mono">{fmtPrice(result.entire_set)} {quoteAsset}/{baseAsset}</td>
                  </tr>
                  <tr>
                    <td className="amm-info-label">Std dev</td>
                    <td className="mono">{result.entire_set.standard_deviation ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="amm-info-label">Data points</td>
                    <td>{result.entire_set.size ?? '—'}</td>
                  </tr>
                </>
              )}
              {result.trimmed_set && (
                <>
                  <tr>
                    <td className="amm-info-label">Trimmed mean</td>
                    <td className="mono">{fmtPrice(result.trimmed_set)} {quoteAsset}/{baseAsset}</td>
                  </tr>
                  <tr>
                    <td className="amm-info-label">Trimmed size</td>
                    <td>{result.trimmed_set.size ?? '—'}</td>
                  </tr>
                </>
              )}
              {result.median != null && (
                <tr>
                  <td className="amm-info-label">Median</td>
                  <td className="mono">{(Number(result.median) * Math.pow(10, -Number(result.scale ?? 0))).toPrecision(8)} {quoteAsset}/{baseAsset}</td>
                </tr>
              )}
              <tr>
                <td className="amm-info-label">Ledger</td>
                <td>{result.ledger_current_index ?? result.ledger_index ?? '—'}</td>
              </tr>
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}

// ─── Page shell ─────────────────────────────────────────────────────────────

const TABS = [
  ['set',       'Create / Update'],
  ['delete',    'Delete'],
  ['aggregate', 'Aggregate Price'],
]

export default function OraclePage() {
  const [tab, setTab] = useState('set')

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Oracle</div>
        <h2>On-chain price feeds.</h2>
        <p>Publish, update, and query price oracle data directly on the XRP Ledger — no external bridge required.</p>
      </div>

      <div className="glass-card" style={{ padding: '4px 8px', marginBottom: 10 }}>
        <div className="tab-bar">
          {TABS.map(([k, l]) => (
            <button key={k}
              className={'tab-btn' + (tab === k ? ' tab-btn-active' : '')}
              onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div>
          {tab === 'set'       && <OracleSetPanel />}
          {tab === 'delete'    && <OracleDeletePanel />}
          {tab === 'aggregate' && <AggregatePricePanel />}
        </div>
        <div className="flow">
          <WalletCard />
          <div className="glass-card">
            <div className="section-title">How XRPL oracles work</div>
            <p className="muted" style={{ marginBottom: 8 }}>
              An oracle object lives on-ledger under the publisher's account. Each object holds a <strong>PriceDataSeries</strong> — up to 10 base/quote price pairs updated in a single transaction.
            </p>
            <p className="muted" style={{ marginBottom: 8 }}>
              Multiple publishers can post prices for the same pair. <strong>get_aggregate_price</strong> computes the trimmed mean and median across all specified feeds — giving you a manipulation-resistant reference price without a centralized intermediary.
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              <strong>LastUpdateTime</strong> is a Ripple-epoch timestamp. Prices older than the configurable staleness window are excluded from aggregation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
