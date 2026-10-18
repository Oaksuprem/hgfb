import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useXrpl } from '../context/XrplContext'
import TxModal from '../components/TxModal'

const STEPS = ['Authorize', 'Draft', 'Sign', 'Send']

export default function SponsorPage() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()
  const [step, setStep] = useState(0)

  const [sponsorSeed,   setSponsorSeed]   = useState('')
  const [sponsorAddr,   setSponsorAddr]   = useState('')
  const [quorum,        setQuorum]        = useState('2')
  const [settingUp,     setSettingUp]     = useState(false)

  const [txDest,    setTxDest]    = useState('')
  const [txAmount,  setTxAmount]  = useState('')

  const [builtTx,    setBuiltTx]    = useState(null)
  const [sig1,       setSig1]       = useState('')
  const [sig2,       setSig2]       = useState('')
  const [signingP,   setSigningP]   = useState(false)
  const [signingS,   setSigningS]   = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [error,     setError]     = useState('')
  const [info,      setInfo]      = useState('')
  const [txResult,  setTxResult]  = useState(null)

  const resolveSponsor = () => {
    try { return xrpl.Wallet.fromSeed(sponsorSeed.trim()) } catch (_) { return null }
  }

  // ── Step 0: SignerListSet ─────────────────────────────────────────────────
  const setupSignerList = async () => {
    if (!wallet)              { setError('Open your primary book first — Bank tab.'); return }
    if (!sponsorSeed.trim())  { setError('Enter the co-signer seed.'); return }
    const sponsorW = resolveSponsor()
    if (!sponsorW)            { setError('Invalid sponsor seed.'); return }
    setSettingUp(true); setError(''); setInfo('')
    try {
      const c  = await ensureConnected()
      const pw = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'SignerListSet',
        Account: wallet.address,
        SignerQuorum: parseInt(quorum),
        SignerEntries: [
          { SignerEntry: { Account: wallet.address,  SignerWeight: 1 } },
          { SignerEntry: { Account: sponsorW.address, SignerWeight: 1 } },
        ],
      }, { wallet: pw })
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      if (!ok) { setError('SignerListSet failed: ' + result.result.meta.TransactionResult); return }
      addTx({ type: 'SignerListSet', status: 'success', hash: result.result.hash })
      setSponsorAddr(sponsorW.address)
      setInfo('Co-signers locked. You: ' + wallet.address + ' · Partner: ' + sponsorW.address)
      setStep(1)
    } catch (e) { setError('Error: ' + e.message) }
    finally { setSettingUp(false) }
  }

  // ── Step 1: Build tx ──────────────────────────────────────────────────────
  const buildTx = async () => {
    if (!wallet)     { setError('Primary account not loaded.'); return }
    if (!txDest.trim() || !txAmount) { setError('Fill destination and amount.'); return }
    setError('')
    try {
      const c  = await ensureConnected()
      const tx = await c.autofill({
        TransactionType: 'Payment',
        Account: wallet.address,
        Amount: xrpl.xrpToDrops(txAmount),
        Destination: txDest.trim(),
        SigningPubKey: '',
      })
      tx.SigningPubKey = ''
      setBuiltTx(tx)
      setInfo('Draft ready. Both parties sign next.')
      setStep(2)
    } catch (e) { setError('Build failed: ' + e.message) }
  }

  // ── Step 2a: Sign with primary ────────────────────────────────────────────
  const signPrimary = async () => {
    if (!builtTx || !wallet) return
    setSigningP(true); setError('')
    try {
      const pw     = xrpl.Wallet.fromSeed(wallet.seed)
      const signed = pw.sign(builtTx, true)
      setSig1(signed.tx_blob)
      setInfo('You signed.')
    } catch (e) { setError('Primary sign failed: ' + e.message) }
    finally { setSigningP(false) }
  }

  // ── Step 2b: Sign with sponsor ────────────────────────────────────────────
  const signSponsor = async () => {
    if (!builtTx || !sponsorSeed.trim()) { setError('Enter sponsor seed.'); return }
    setSigningS(true); setError('')
    try {
      const sw     = xrpl.Wallet.fromSeed(sponsorSeed.trim())
      const signed = sw.sign(builtTx, true)
      setSig2(signed.tx_blob)
      setInfo('Partner signed. Ready to send.')
    } catch (e) { setError('Sponsor sign failed: ' + e.message) }
    finally { setSigningS(false) }
  }

  // ── Step 3: Submit multisig ───────────────────────────────────────────────
  const submitMultisig = async () => {
    if (!sig1 || !sig2) { setError('Both signatures required.'); return }
    setSubmitting(true); setError(''); setTxResult(null)
    try {
      const c        = await ensureConnected()
      const combined = xrpl.multisign([sig1, sig2])
      const result   = await c.submitAndWait(combined)
      setTxResult(result)
      addTx({
        type: 'Multisig Payment',
        status: result.result.meta.TransactionResult === 'tesSUCCESS' ? 'success' : 'error',
        hash: result.result.hash,
      })
    } catch (e) { setError('Submit failed: ' + e.message) }
    finally { setSubmitting(false) }
  }

  const reset = () => {
    setStep(0); setSig1(''); setSig2(''); setBuiltTx(null)
    setTxResult(null); setInfo(''); setError('')
    setSponsorAddr('')
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Co-sign</div>
        <h2>Two keys. One move.</h2>
        <p>Authorize a partner, draft the payment, collect both signatures, and send — the grown-up way to share control.</p>
        <p className="muted"><Link to="/multisign">Open the full signer desk</Link> for up to eight signers and any transaction type.</p>
      </div>

      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div className={'step' + (i === step ? ' active' : '') + (i < step ? ' done' : '')}>
              <div className="step-num">{i < step ? '✓' : i + 1}</div>
              <span className="step-label">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="step-line"></div>}
          </div>
        ))}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {info  && <div className="alert alert-success">{info}</div>}

      {step === 0 && (
        <div className="glass-card fade-in">
          <div className="section-title">Authorize a partner</div>
          <p className="muted">Add a co-signer to your book. Choose whether one key is enough, or both must agree.</p>
          {!wallet && <div className="alert alert-warning" style={{ marginBottom: 10 }}>Open your primary book on Bank first.</div>}
          {wallet && (
            <div className="field">
              <label>Your book</label>
              <input type="text" value={wallet.address} readOnly className="address" style={{ background: 'rgba(232,168,86,0.06)' }} />
            </div>
          )}
          <div className="field">
            <label>Partner seed</label>
            <input type="password" placeholder="sEdT…" value={sponsorSeed}
              onChange={e => setSponsorSeed(e.target.value)} />
          </div>
          <div className="field">
            <label>Rule</label>
            <select value={quorum} onChange={e => setQuorum(e.target.value)}>
              <option value="1">1 of 2 — either of you can send</option>
              <option value="2">2 of 2 — both must sign</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={setupSignerList} disabled={settingUp || !wallet}>
            {settingUp ? (<><span className="spinner"></span> Authorizing…</>) : 'Authorize'}
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="glass-card fade-in">
          <div className="section-title">Draft the payment</div>
          <p className="muted">Fee and sequence fill automatically. Nobody has signed yet.</p>
          {sponsorAddr && (
            <div className="field">
              <label>Partner</label>
              <input type="text" value={sponsorAddr} readOnly className="address" style={{ background: 'rgba(232,168,86,0.06)' }} />
            </div>
          )}
          <div className="field">
            <label>To</label>
            <input type="text" placeholder="r…" value={txDest} onChange={e => setTxDest(e.target.value)} />
          </div>
          <div className="field">
            <label>Amount (XRP)</label>
            <input type="number" placeholder="10" min="0" step="any" value={txAmount} onChange={e => setTxAmount(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary" onClick={buildTx}>Draft →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="fade-in">
          <div className="glass-card" style={{ marginBottom: 16 }}>
            <div className="section-title">Collect signatures</div>
            <p className="muted">Same draft. Two independent signs. Then we combine and send.</p>

            {builtTx && (
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Unsigned draft</label>
                <pre className="result-box" style={{ minHeight: 64 }}>{JSON.stringify(builtTx, null, 2)}</pre>
              </div>
            )}

            <div className="grid-2">
              <div className="glass-card">
                <div className="section-title">You</div>
                <div className={'alert ' + (sig1 ? 'alert-success' : 'alert-info')} style={{ marginBottom: 8 }}>
                  {sig1 ? 'Signed' : 'Waiting on you'}
                </div>
                <button className="btn btn-secondary btn-full" onClick={signPrimary} disabled={signingP || !!sig1}>
                  {signingP ? (<><span className="spinner"></span> Signing…</>) : sig1 ? 'Signed' : 'Sign'}
                </button>
              </div>
              <div className="glass-card">
                <div className="section-title">Partner</div>
                <div className={'alert ' + (sig2 ? 'alert-success' : 'alert-info')} style={{ marginBottom: 8 }}>
                  {sig2 ? 'Signed' : 'Waiting on partner'}
                </div>
                <button className="btn btn-secondary btn-full" onClick={signSponsor} disabled={signingS || !!sig2}>
                  {signingS ? (<><span className="spinner"></span> Signing…</>) : sig2 ? 'Signed' : 'Sign as partner'}
                </button>
              </div>
            </div>

            <hr className="divider" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!sig1 || !sig2}>
                {(!sig1 || !sig2) ? 'Waiting on both…' : 'Send →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card fade-in">
          <div className="section-title">Send the combined payment</div>
          <p className="muted">Both signatures merge into one settlement. Then it hits the ledger.</p>
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>You</div>
              <div className={'badge ' + (sig1 ? 'badge-connected' : 'badge-disconnected')}>
                {sig1 ? 'Ready' : 'Missing'}
              </div>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Partner</div>
              <div className={'badge ' + (sig2 ? 'badge-connected' : 'badge-disconnected')}>
                {sig2 ? 'Ready' : 'Missing'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={submitMultisig} disabled={submitting || !sig1 || !sig2}>
              {submitting ? (<><span className="spinner"></span> Sending…</>) : 'Send combined'}
            </button>
          </div>
        </div>
      )}

      {txResult && (
        <TxModal tx={txResult} onClose={reset} />
      )}
    </div>
  )
}
