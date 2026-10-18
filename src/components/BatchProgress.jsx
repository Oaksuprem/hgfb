/**
 * BatchProgress — displays real-time progress for ticket-based batch operations.
 * Accepts useTxBatch state as props.
 */
export default function BatchProgress({
  ticketLoading, batchLoading, submitLoading,
  ticketError, batchError, submitError,
  tickets = [], builtBatch = [], results = [],
}) {
  const total    = builtBatch.length || tickets.length
  const done     = results.length
  const successes= results.filter(r => r.success).length
  const failures = results.filter(r => !r.success).length
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0

  // Nothing to show
  if (!ticketLoading && !batchLoading && !submitLoading && !total &&
      !ticketError && !batchError && !submitError) return null

  return (
    <div className="glass-card fade-in" style={{ marginTop: 10 }}>
      {/* Phase indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className={'badge ' + (tickets.length ? 'badge-connected' : ticketLoading ? 'badge-testnet' : 'badge-disconnected')}>
          {ticketLoading ? <><span className="spinner" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }}></span> Creating tickets…</> : tickets.length ? `${tickets.length} tickets` : 'Tickets'}
        </span>
        <span className={'badge ' + (builtBatch.length ? 'badge-connected' : batchLoading ? 'badge-testnet' : 'badge-disconnected')}>
          {batchLoading ? <><span className="spinner" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }}></span> Building…</> : builtBatch.length ? `${builtBatch.length} built` : 'Build'}
        </span>
        <span className={'badge ' + (done === total && total > 0 ? 'badge-connected' : submitLoading ? 'badge-testnet' : 'badge-disconnected')}>
          {submitLoading ? <><span className="spinner" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }}></span> Submitting…</> : done > 0 ? `${done}/${total} submitted` : 'Submit'}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && submitLoading && (
        <div style={{ background: 'rgba(255,247,237,.08)', borderRadius: 4, height: 6, marginBottom: 10 }}>
          <div style={{ background: 'var(--grad)', height: '100%', borderRadius: 4, width: pct + '%', transition: 'width .3s' }} />
        </div>
      )}

      {/* Error messages */}
      {ticketError  && <div className="alert alert-danger" style={{ marginBottom: 6 }}>{ticketError}</div>}
      {batchError   && <div className="alert alert-danger" style={{ marginBottom: 6 }}>{batchError}</div>}
      {submitError  && <div className="alert alert-danger" style={{ marginBottom: 6 }}>{submitError}</div>}

      {/* Summary */}
      {results.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-connected">✓ {successes} success</span>
            {failures > 0 && <span className="badge badge-disconnected">✗ {failures} failed</span>}
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} className="tx-item" style={{ marginBottom: 4 }}>
                <div className="tx-item-row">
                  <span className={'badge ' + (r.success ? 'badge-connected' : 'badge-disconnected')} style={{ fontSize: '0.62rem' }}>
                    {r.success ? '✓' : '✗'} #{i + 1}
                  </span>
                  {r.hash && <span className="mono" style={{ fontSize: '0.62rem', color: 'var(--accent)' }}>{r.hash.slice(0, 8)}…</span>}
                </div>
                {!r.success && r.error && (
                  <div style={{ color: 'var(--pink)', fontSize: '0.65rem', marginTop: 2 }}>{r.error}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
