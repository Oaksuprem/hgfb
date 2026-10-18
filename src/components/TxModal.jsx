import { useXrpl, EXPLORERS } from '../context/XrplContext'

export default function TxModal({ tx, onClose }) {
  const { network } = useXrpl()
  if (!tx) return null

  const meta    = tx.result?.meta ?? {}
  const status  = meta.TransactionResult
  const hash    = tx.result?.hash
  const ledger  = tx.result?.ledger_index
  const base    = EXPLORERS[network]
  const success = status === 'tesSUCCESS'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box glass-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settlement</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className={'alert ' + (success ? 'alert-success' : 'alert-danger')} style={{ marginBottom: 10 }}>
          {success ? 'Cleared. It’s on the ledger.' : (status || 'Didn’t clear')}
        </div>

        {ledger && (
          <div className="modal-meta">
            <span className="modal-meta-label">Ledger</span>
            <a href={base + '/ledgers/' + ledger} target="_blank" rel="noreferrer" className="address">
              #{ledger}
            </a>
          </div>
        )}
        {hash && (
          <div className="modal-meta">
            <span className="modal-meta-label">Hash</span>
            <span className="address" style={{ fontSize: '0.68rem' }}>{hash}</span>
          </div>
        )}

        <pre className="result-box" style={{ marginTop: 10, minHeight: 72 }}>
          {JSON.stringify(tx.result, null, 2)}
        </pre>

        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          {hash && (
            <a href={base + '/transactions/' + hash} target="_blank" rel="noreferrer"
              className="btn btn-primary btn-sm">
              Open ledger
            </a>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
