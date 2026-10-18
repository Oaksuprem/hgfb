import { useXrpl, EXPLORERS } from '../context/XrplContext'
import { formatAgo } from '../lib/tx'

export default function TxHistory() {
  const { txHistory, network, wallet, refreshHistory, historyLoading } = useXrpl()

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Activity</div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => refreshHistory()}
          disabled={historyLoading || !wallet}
        >
          {historyLoading ? <span className="spinner"></span> : 'Refresh'}
        </button>
      </div>
      {!wallet ? (
        <div className="muted" style={{ margin: '8px 0 0' }}>Open a book to see ledger activity.</div>
      ) : txHistory.length === 0 ? (
        <div className="muted" style={{ margin: '8px 0 0' }}>
          {historyLoading ? 'Reading the ledger…' : 'No validated activity on this book yet.'}
        </div>
      ) : (
        <div className="tx-list">
          {txHistory.map((tx) => {
            const url = tx.hash ? EXPLORERS[network] + '/transactions/' + tx.hash : null
            return (
              <div key={tx.hash || tx.ts} className="tx-item">
                <div className="tx-item-row">
                  <span className="tx-type">
                    {tx.direction === 'in' ? '↓ ' : tx.direction === 'out' ? '↑ ' : ''}
                    {tx.label}
                  </span>
                  <span className={'badge ' + (tx.status === 'success' ? 'badge-connected' : tx.status === 'error' ? 'badge-disconnected' : 'badge-testnet')}>
                    {tx.status === 'success' ? 'cleared' : (tx.tes || tx.status)}
                  </span>
                </div>
                {tx.amount && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', marginTop: 2 }}>
                    {tx.amount}
                  </div>
                )}
                <div className="tx-item-row" style={{ marginTop: 3 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{formatAgo(tx.ts)}</span>
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer"
                      style={{ color: 'var(--accent)', fontSize: '0.68rem', fontWeight: 700 }}>View</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
