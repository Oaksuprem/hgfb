import { useCallback, useEffect, useState } from 'react'
import { useXrpl, EXPLORERS } from '../context/XrplContext'
import { holdingsFromLines, shortIssuer } from '../lib/holdings'

export default function WalletCard({ balance, onRefresh, refreshing }) {
  const { wallet, network, ensureConnected } = useXrpl()
  const [showSeed, setShowSeed] = useState(false)
  const [copied,   setCopied]   = useState('')
  const [ownBalance, setOwnBalance] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [linesReady, setLinesReady] = useState(false)

  const loadLines = useCallback(async () => {
    if (!wallet) { setHoldings([]); setLinesReady(false); return }
    setLinesReady(false)
    try {
      const c = await ensureConnected()
      const r = await c.request({ command: 'account_lines', account: wallet.address, ledger_index: 'validated' })
      setHoldings(holdingsFromLines(r.result.lines))
    } catch {
      setHoldings([])
    } finally {
      setLinesReady(true)
    }
  }, [wallet, ensureConnected])

  const loadOwnBalance = useCallback(async () => {
    if (!wallet || balance != null) return
    try {
      const c = await ensureConnected()
      setOwnBalance(await c.getXrpBalance(wallet.address))
    } catch {
      setOwnBalance(null)
    }
  }, [wallet, balance, ensureConnected])

  useEffect(() => {
    if (!wallet) { setHoldings([]); setOwnBalance(null); setLinesReady(false); return }
    loadLines()
    loadOwnBalance()
  }, [wallet, network, loadLines, loadOwnBalance])

  const refreshCard = () => {
    loadLines()
    if (onRefresh) onRefresh()
    else loadOwnBalance()
  }

  const shownBalance = balance != null ? balance : ownBalance

  if (!wallet) return (
    <div className="glass-card" style={{ textAlign: 'center', padding: '22px 14px' }}>
      <div className="brand-mark" style={{ margin: '0 auto 8px' }}>HG</div>
      <div className="muted" style={{ margin: 0 }}>No book on this device. Open one on Bank.</div>
    </div>
  )

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1500)
  }

  const explorerUrl = EXPLORERS[network] + '/accounts/' + wallet.address

  return (
    <div className="glass-card wallet-card">
      <div className="wallet-header">
        <div>
          <div className="wallet-label">Active book</div>
          <div className={'badge badge-' + network}>{network === 'mainnet' ? 'live' : network}</div>
        </div>
        <div className="wallet-balance">
          <span className="balance-amount">{shownBalance != null ? shownBalance : '—'}</span>
          <span className="balance-unit"> XRP</span>
        </div>
      </div>

      <div className="wallet-assets">
        <div className="wallet-field-label">Issued assets</div>
        {!linesReady ? (
          <div className="muted" style={{ margin: 0 }}>Reading assets…</div>
        ) : holdings.length === 0 ? (
          <div className="muted" style={{ margin: 0 }}>No issued assets on this rail.</div>
        ) : holdings.map(asset => (
          <div className="wallet-asset" key={`${asset.code}:${asset.issuer}`}>
            <span>
              <span className="wallet-asset-code">{asset.currency}</span>
              {asset.issuer ? <span className="wallet-asset-issuer"> {shortIssuer(asset.issuer)}</span> : null}
            </span>
            <span className="mono wallet-asset-balance">{asset.balance}</span>
          </div>
        ))}
      </div>

      <div className="wallet-field">
        <div className="wallet-field-label">Address</div>
        <div className="wallet-field-value">
          <span className="address" style={{ flex: 1, fontSize: '0.72rem' }}>{wallet.address}</span>
          <button
            className={'btn btn-sm btn-secondary' + (copied === 'addr' ? ' copied' : '')}
            onClick={() => copy(wallet.address, 'addr')}
          >
            {copied === 'addr' ? '✓' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="wallet-field">
        <div className="wallet-field-label">Seed</div>
        <div className="wallet-field-value">
          <span className="mono" style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {showSeed ? wallet.seed : '••••••••••••••••'}
          </span>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowSeed(s => !s)}>
            {showSeed ? 'Hide' : 'Show'}
          </button>
          {showSeed && (
            <button
              className={'btn btn-sm btn-secondary' + (copied === 'seed' ? ' copied' : '')}
              onClick={() => copy(wallet.seed, 'seed')}
            >
              {copied === 'seed' ? '✓' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      <p className="muted" style={{ margin: '8px 0 0' }}>Your private key stays in local storage for self-custody. Each rail shows this account’s balance, assets, and history.</p>

      <div className="wallet-actions">
        {onRefresh && (
          <button className="btn btn-secondary btn-sm" onClick={refreshCard} disabled={refreshing}>
            {refreshing ? <span className="spinner"></span> : 'Refresh'}
          </button>
        )}
        <a href={explorerUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
          Ledger
        </a>
      </div>
    </div>
  )
}
