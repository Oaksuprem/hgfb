import { useState, useEffect } from 'react'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxHistory from '../components/TxHistory'

export default function AccountPage() {
  const { xrpl, network, wallet, setWallet, ensureConnected, connected, addTx } = useXrpl()
  const [seedInput,  setSeedInput]  = useState('')
  const [loading,    setLoading]    = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [balance,    setBalance]    = useState(null)
  const [error,      setError]      = useState('')
  const [info,       setInfo]       = useState('')

  const refreshBalance = async () => {
    if (!wallet) return
    setRefreshing(true)
    try {
      const c = await ensureConnected()
      setBalance(await c.getXrpBalance(wallet.address))
    } catch (e) { console.error(e) }
    finally { setRefreshing(false) }
  }

  useEffect(() => {
    if (wallet) refreshBalance()
    else setBalance(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet])

  const getNewAccount = async () => {
    if (network === 'mainnet') { setError('Live rail is closed for instant open. Import a book instead.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      setInfo('Opening your book…')
      const { wallet: w } = await c.fundWallet()
      const bal = await c.getXrpBalance(w.address)
      setWallet({ address: w.address, seed: w.seed })
      setBalance(bal)
      setInfo('You’re in. Book funded and ready.')
      addTx({ type: 'FundWallet', status: 'success' })
    } catch (e) { setError('Couldn’t open: ' + e.message) }
    finally { setLoading(false) }
  }

  const importFromSeed = async () => {
    if (!seedInput.trim()) { setError('Drop your seed to continue.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const w = xrpl.Wallet.fromSeed(seedInput.trim())
      const c = await ensureConnected()
      let bal = null
      try { bal = await c.getXrpBalance(w.address) } catch (_) {}
      setWallet({ address: w.address, seed: w.seed })
      setBalance(bal)
      setInfo('Welcome back. Book restored.')
    } catch (e) { setError('That seed didn’t check out: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Hell's Gate Finance Bank</div>
        <h2>Your book. Your rails.</h2>
        <p>A new age of payment, investment, and access to global opportunities — open in seconds, move with confidence.</p>
      </div>

      <div className="grid-2">
        <div className="flow">
          {error && <div className="alert alert-danger">{error}</div>}
          {info  && <div className="alert alert-success">{info}</div>}
          {!connected && (
            <div className="alert alert-info">Connecting to the ledger. One moment.</div>
          )}

          <div className="glass-card">
            <div className="section-title">Open a book</div>
            <p className="muted">
              Instant funded access on {network}. Built for test rails — Devnet and Testnet only.
            </p>
            <button className="btn btn-primary btn-full" onClick={getNewAccount} disabled={loading || network === 'mainnet'}>
              {loading ? (<><span className="spinner"></span> Opening…</>) : 'Open with HGFB'}
            </button>
            {network === 'mainnet' && (
              <div className="alert alert-warning" style={{ marginTop: 8 }}>
                Instant open is paused on Live. Import an existing book.
              </div>
            )}
          </div>

          <div className="glass-card">
            <div className="section-title">Already with us?</div>
            <p className="muted">Restore with your family seed. Starts with <span className="mono">s…</span> — keep it private.</p>
            <div className="field">
              <label>Recovery seed</label>
              <input
                type="password"
                placeholder="sEdT…"
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && importFromSeed()}
              />
            </div>
            <button className="btn btn-secondary btn-full" onClick={importFromSeed} disabled={loading}>
              {loading ? (<><span className="spinner"></span> Restoring…</>) : 'Restore book'}
            </button>
            {wallet && (
              <button
                className="btn btn-danger btn-full"
                style={{ marginTop: 8 }}
                onClick={() => { setWallet(null); setBalance(null); setInfo('Signed out of this device.'); }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        <div className="flow">
          <WalletCard balance={balance} onRefresh={refreshBalance} refreshing={refreshing} />
          <TxHistory />
        </div>
      </div>
    </div>
  )
}
