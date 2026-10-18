import { useState, useEffect, useCallback } from 'react'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxModal from '../components/TxModal'
import TokenSelect from '../components/TokenSelect'
import { useTxBatch } from '../hooks/transactions/useTxBatch'
import BatchProgress from '../components/BatchProgress'
import { defaultTokenId, tokenById } from '../lib/tokens'

export default function TrustLinePage() {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()
  const [tokenId,      setTokenId]      = useState(() => defaultTokenId(network, { allowXrp: false }))
  const [limit,        setLimit]        = useState('1000000000')
  const [lines,        setLines]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [loadingLines, setLoadingLines] = useState(false)
  const [error,        setError]        = useState('')
  const [txResult,     setTxResult]     = useState(null)

  // ── Batch state ──────────────────────────────────────────────────────────
  const batch = useTxBatch()
  const [tlRows, setTlRows] = useState(() => {
    const first = defaultTokenId(network, { allowXrp: false })
    return [
      { tokenId: first, limit: '1000000000' },
      { tokenId: first, limit: '1000000000' },
    ]
  })
  const updateTlRow = (i, field, val) =>
    setTlRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const addTlRow    = () => setTlRows(prev => prev.length < 50 ? [...prev, { tokenId: defaultTokenId(network, { allowXrp: false }), limit: '1000000000' }] : prev)
  const removeTlRow = (i) => setTlRows(prev => prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev)
  const [tlTab,     setTlTab]     = useState('single')

  const runBatchTrustLines = async () => {
    if (!wallet) return
    const txs = tlRows.map(r => {
      const token = tokenById(network, r.tokenId, { allowXrp: false })
      if (!token) throw new Error('Pick an asset from the directory.')
      return {
        TransactionType: 'TrustSet',
        Account: wallet.address,
        LimitAmount: { currency: token.code, issuer: token.issuer, value: r.limit },
      }
    })
    const seqs = await batch.createTicketBatch(txs.length)
    if (!seqs) return
    const built = await batch.buildBatch(txs)
    if (!built) return
    await batch.submitBatch()
  }

  const fetchLines = useCallback(async () => {
    if (!wallet) return
    setLoadingLines(true)
    try {
      const c = await ensureConnected()
      const r = await c.request({ command: 'account_lines', account: wallet.address, ledger_index: 'validated' })
      setLines(r.result.lines || [])
    } catch (e) { console.error(e) }
    finally { setLoadingLines(false) }
  }, [wallet, ensureConnected])

  useEffect(() => { fetchLines() }, [fetchLines])

  const setTrustLine = async () => {
    const token = tokenById(network, tokenId, { allowXrp: false })
    if (!wallet) { setError('Open a book first — Bank tab.'); return }
    if (!token)  { setError('Pick an asset from the directory.'); return }
    setLoading(true); setError(''); setTxResult(null)
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'TrustSet',
        Account: wallet.address,
        LimitAmount: { currency: token.code, issuer: token.issuer, value: limit },
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'TrustSet', status: ok ? 'success' : 'error', currency: token.code, hash: result.result.hash })
      if (ok) setTimeout(fetchLines, 2500)
    } catch (e) { setError('Couldn\u2019t open the line: ' + e.message) }
    finally { setLoading(false) }
  }

  const removeTrustLine = async (line) => {
    if (!wallet) return
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'TrustSet',
        Account: wallet.address,
        LimitAmount: { currency: line.currency, issuer: line.account, value: '0' },
      }, { wallet: w })
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'TrustSet (Remove)', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setTimeout(fetchLines, 2500)
    } catch (e) { setError('Couldn\u2019t close the line: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Assets</div>
        <h2>Hold the world. On your terms.</h2>
        <p>Open a line to an issuer and you&apos;re cleared to hold that asset. That&apos;s how global markets show up in your book.</p>
      </div>

      <div className="glass-card" style={{ padding: '4px 8px', marginBottom: 10 }}>
        <div className="tab-bar">
          <button className={'tab-btn' + (tlTab === 'single' ? ' tab-btn-active' : '')} onClick={() => setTlTab('single')}>Single line</button>
          <button className={'tab-btn' + (tlTab === 'batch'  ? ' tab-btn-active' : '')} onClick={() => { setTlTab('batch'); batch.reset() }}>Batch lines</button>
        </div>
      </div>

      {tlTab === 'single' && (
        <div className="grid-2">
          <div className="flow">
            {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}
            {error   && <div className="alert alert-danger">{error}</div>}

            <div className="glass-card">
              <div className="section-title">Open a line</div>
              <p className="muted">Authorize an issuer. Then you can receive, hold, and invest in that asset.</p>

              <div className="field-row">
                <TokenSelect
                  network={network}
                  tokenId={tokenId}
                  allowXrp={false}
                  onChange={token => setTokenId(token.id)}
                />
                <div className="field">
                  <label>Limit</label>
                  <input type="number" placeholder="1000000000" value={limit}
                    onChange={e => setLimit(e.target.value)} min="0" />
                </div>
              </div>

              <button className="btn btn-primary btn-full" onClick={setTrustLine} disabled={loading || !wallet}>
                {loading ? (<><span className="spinner"></span> Opening\u2026</>) : 'Open line'}
              </button>
            </div>
          </div>

          <div className="flow">
            <WalletCard />
          </div>
        </div>
      )}

      {tlTab === 'batch' && (
        <div className="fade-in">
          <div className="page-header" style={{ marginBottom: 8 }}>
            <div className="section-title">Batch trust line setup</div>
            <p className="muted">Open multiple trust lines in parallel using XRPL Tickets. All submitted simultaneously.</p>
          </div>

          {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}

          {tlRows.map((r, i) => (
            <div key={i} className="glass-card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="badge badge-devnet">Line {i + 1}</span>
                {tlRows.length > 2 && <button className="btn btn-secondary btn-sm" onClick={() => removeTlRow(i)}>\u2715</button>}
              </div>
              <div className="field-row">
                <TokenSelect
                  network={network}
                  tokenId={r.tokenId}
                  allowXrp={false}
                  label={`Asset ${i + 1}`}
                  onChange={token => updateTlRow(i, 'tokenId', token.id)}
                />
                <div className="field"><label>Limit</label>
                  <input type="number" placeholder="1000000000" value={r.limit}
                    onChange={e => updateTlRow(i, 'limit', e.target.value)} min="0" />
                </div>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-secondary" onClick={addTlRow} disabled={tlRows.length >= 50}>+ Add line</button>
            <button className="btn btn-primary" onClick={runBatchTrustLines}
              disabled={!wallet || batch.ticketLoading || batch.batchLoading || batch.submitLoading}>
              {(batch.ticketLoading || batch.batchLoading || batch.submitLoading)
                ? <><span className="spinner"></span> Running batch\u2026</>
                : `Open ${tlRows.length} lines in parallel`}
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

      <div className="glass-card" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Your lines</div>
          <button className="btn btn-secondary btn-sm" onClick={fetchLines} disabled={loadingLines}>
            {loadingLines ? <span className="spinner"></span> : 'Refresh'}
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="muted" style={{ margin: 0 }}>
            {loadingLines ? 'Loading\u2026' : 'No lines yet. Open one to start holding issued assets.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Currency</th><th>Issuer</th><th>Balance</th><th>Limit</th><th></th></tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i}>
                  <td><span className="badge badge-devnet">{ln.currency}</span></td>
                  <td><span className="address" style={{ fontSize: '0.72rem' }}>{ln.account}</span></td>
                  <td className="mono">{ln.balance}</td>
                  <td className="mono">{ln.limit}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => removeTrustLine(ln)}
                      disabled={loading || Number(ln.balance) !== 0}
                      title={Number(ln.balance) !== 0 ? 'Balance must be 0 to remove' : 'Remove'}
                    >Close</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}
