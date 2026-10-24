/**
 * ConfidentialTokensPage
 *
 * Full workflow for XLS-96 Confidential Transfers for MPTs:
 *
 *  1. Issue     — MPTokenIssuanceCreate with tfMPTCanHoldConfidentialBalance
 *  2. Keys      — Register IssuerEncryptionKey (and optional AuditorEncryptionKey)
 *                 via MPTokenIssuanceSet; derive keypairs with deriveConfidentialKeypair
 *  3. Distribute— MPTokenAuthorize + Payment to fund a holder/second account
 *  4. Convert   — ConfidentialMPTConvert: public balance → confidential inbox
 *  5. Merge     — ConfidentialMPTMergeInbox: inbox → spending balance
 *  6. Inspect   — fetchMPToken / fetchMPTokenIssuance + decrypt with loadMptCrypto
 *
 * Requires the ConfidentialTransfer amendment (devnet).
 */

import { useState, useCallback } from 'react'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxModal from '../components/TxModal'

// ─── helpers ─────────────────────────────────────────────────────────────────

// xrpl is imported statically via XrplContext; we use the full module here for
// confidential-transfer-specific helpers that may or may not exist in the version.
import * as xrplLib from 'xrpl'

// ─── Issue panel ─────────────────────────────────────────────────────────────

function IssuePanel({ onIssued }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [ticker,   setTicker]   = useState('CTST')
  const [name,     setName]     = useState('Confidential Token')
  const [desc,     setDesc]     = useState('A confidential MPT.')
  const [maxAmt,   setMaxAmt]   = useState('1000000000')
  const [scale,    setScale]    = useState('0')

  // Additional optional MPT flags
  const [canTransfer,setCanTransfer] = useState(true)
  const [canClawback,setCanClawback] = useState(true)
  const [canLock,    setCanLock]     = useState(true)

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [info,     setInfo]     = useState('')
  const [txResult, setTxResult] = useState(null)

  const issue = async () => {
    if (!wallet) { setError('Open an account first — Bank tab.'); return }
    if (!ticker.trim()) { setError('Ticker required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)

      // Build flags — tfMPTCanHoldConfidentialBalance = 0x00000020
      let flags = 0x00000020 // always set for confidential
      if (canTransfer) flags |= 0x00000008 // tfMPTCanTransfer
      if (canClawback) flags |= 0x00000010 // tfMPTCanClawback
      if (canLock)     flags |= 0x00000002 // tfMPTCanLock

      let metadata
      try {
        if (typeof xrplLib.encodeMPTokenMetadata === 'function') {
          metadata = xrplLib.encodeMPTokenMetadata({
            ticker: ticker.trim(),
            name: name.trim(),
            desc: desc.trim(),
          })
        }
      } catch (_) {
        metadata = undefined
      }

      const tx = {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: wallet.address,
        AssetScale: Number(scale) || 0,
        MaximumAmount: maxAmt.trim() || '1000000000',
        TransferFee: 0, // must be 0 for confidential transfers
        Flags: flags,
      }
      if (metadata) tx.MPTokenMetadata = metadata

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenIssuanceCreate (Confidential)', status: ok ? 'success' : 'error', hash: result.result.hash })

      if (ok) {
        const issuanceID = result.result.meta?.mpt_issuance_id
        setInfo(`Issuance created. ID: ${issuanceID || '(see tx metadata)'}`)
        if (onIssued && issuanceID) onIssued(issuanceID)
      }
    } catch (e) { setError('MPTokenIssuanceCreate failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flow">
      <div className="ct-info-box">
        <strong>Step 1 — Create the issuance</strong>: Issue an MPT with
        the <code>tfMPTCanHoldConfidentialBalance</code> flag. TransferFee must be 0 — the ledger
        cannot compute a percentage fee on an encrypted amount.
      </div>
      <div className="glass-card flow">
        <div className="section-title">Issue confidential MPT</div>
        <div className="field-row">
          <div className="field">
            <label>Ticker</label>
            <input type="text" placeholder="CTST" value={ticker} onChange={e => setTicker(e.target.value)} />
          </div>
          <div className="field">
            <label>Asset scale (decimals)</label>
            <input type="number" min="0" max="19" value={scale} onChange={e => setScale(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Name</label>
          <input type="text" placeholder="Confidential Token" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <input type="text" placeholder="A short description" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div className="field">
          <label>Maximum supply</label>
          <input type="text" placeholder="1000000000" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} />
        </div>

        <div className="section-title" style={{ marginTop: 4 }}>Additional flags</div>
        <div className="flags-grid">
          <label className="flag-row">
            <input type="checkbox" checked disabled readOnly />
            <span className="flag-label">Can hold confidential balance</span>
            <span className="flag-hint">Required. Enables EC-ElGamal encrypted balances.</span>
          </label>
          <label className="flag-row">
            <input type="checkbox" checked={canTransfer} onChange={e => setCanTransfer(e.target.checked)} />
            <span className="flag-label">Can transfer</span>
            <span className="flag-hint">Holders can send tokens to each other.</span>
          </label>
          <label className="flag-row">
            <input type="checkbox" checked={canClawback} onChange={e => setCanClawback(e.target.checked)} />
            <span className="flag-label">Can clawback</span>
            <span className="flag-hint">Issuer can recover balances from holders.</span>
          </label>
          <label className="flag-row">
            <input type="checkbox" checked={canLock} onChange={e => setCanLock(e.target.checked)} />
            <span className="flag-label">Can lock</span>
            <span className="flag-hint">Issuer can freeze individual holder balances.</span>
          </label>
        </div>
        <div className="alert alert-info">
          TransferFee is always 0 for confidential issuances — the ledger cannot calculate
          a percentage fee on an encrypted amount.
        </div>
        {error  && <div className="alert alert-danger">{error}</div>}
        {info   && <div className="alert alert-success">{info}</div>}
        <button className="btn btn-primary btn-full" onClick={issue} disabled={loading || !wallet}>
          {loading ? <><span className="spinner" />&nbsp;Creating…</> : 'Create confidential issuance'}
        </button>
      </div>
      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Encryption keys panel ────────────────────────────────────────────────────

function KeysPanel({ issuanceID: propID }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [issuanceID,      setIssuanceID]      = useState(propID || '')
  const [issuerPubKey,    setIssuerPubKey]    = useState('')
  const [auditorPubKey,   setAuditorPubKey]   = useState('')

  // Derivation
  const [deriveSeed,      setDeriveSeed]      = useState('')
  const [derivedKeys,     setDerivedKeys]     = useState(null)
  const [deriveError,     setDeriveError]     = useState('')

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [info,      setInfo]      = useState('')
  const [txResult,  setTxResult]  = useState(null)

  // Sync from parent
  // (propID may update after issuance)

  const deriveKeypair = async () => {
    const seed = (deriveSeed || wallet?.seed || '').trim()
    if (!seed) { setDeriveError('Seed required.'); return }
    setDeriveError(''); setDerivedKeys(null)
    try {
      if (typeof xrplLib.deriveConfidentialKeypair !== 'function') {
        setDeriveError('deriveConfidentialKeypair not available in this xrpl.js version. Upgrade to v5.1+.')
        return
      }
      const kp = xrplLib.deriveConfidentialKeypair(seed)
      setDerivedKeys(kp)
    } catch (e) {
      setDeriveError('Derivation failed: ' + e.message)
    }
  }

  const registerKeys = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    if (!issuanceID.trim()) { setError('Issuance ID required.'); return }
    if (!issuerPubKey.trim()) { setError('Issuer encryption public key required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'MPTokenIssuanceSet',
        Account: wallet.address,
        MPTokenIssuanceID: issuanceID.trim(),
        IssuerEncryptionKey: issuerPubKey.trim(),
      }
      // AuditorEncryptionKey must be registered in the SAME tx as IssuerEncryptionKey
      if (auditorPubKey.trim()) tx.AuditorEncryptionKey = auditorPubKey.trim()

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenIssuanceSet (Keys)', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo('Encryption keys registered. Key registration is permanent and cannot be changed.')
    } catch (e) { setError('Key registration failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flow">
      <div className="ct-info-box">
        <strong>Step 2 — Register encryption keys</strong>: Holders cannot convert
        balances to confidential until the issuer registers an
        <code> IssuerEncryptionKey</code>. Register the <code>AuditorEncryptionKey</code> in
        the same transaction — it is a permanent, one-time operation.
      </div>

      {/* Derive helper */}
      <div className="glass-card flow">
        <div className="section-title">Derive EC-ElGamal keypair</div>
        <p className="muted">
          EC-ElGamal keypairs are derived deterministically from an account seed — separate
          from the account's signing key. The private key decrypts balances; the public key
          is registered on the ledger.
        </p>
        <div className="field-row">
          <div className="field">
            <label>Account seed (leave blank to use active wallet)</label>
            <input type="text" placeholder="s… or leave blank for active wallet seed"
              value={deriveSeed} onChange={e => setDeriveSeed(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={deriveKeypair}>Derive</button>
          </div>
        </div>
        {deriveError && <div className="alert alert-danger">{deriveError}</div>}
        {derivedKeys && (
          <div className="ct-keypair-box fade-in">
            <div className="ct-keypair-row">
              <span className="ct-keypair-label">Public key</span>
              <span className="mono ct-keypair-val" style={{ color: 'var(--teal)' }}>{derivedKeys.publicKey}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setIssuerPubKey(derivedKeys.publicKey); setInfo('Public key copied to issuer field.') }}>Use as issuer key</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setAuditorPubKey(derivedKeys.publicKey); setInfo('Public key copied to auditor field.') }}>Use as auditor key</button>
            </div>
            <div className="ct-keypair-row">
              <span className="ct-keypair-label">Private key</span>
              <span className="mono ct-keypair-val" style={{ color: 'var(--yellow)', fontSize: '.66rem' }}>
                {derivedKeys.privateKey.slice(0, 20)}…{derivedKeys.privateKey.slice(-8)}
              </span>
              <span className="muted" style={{ fontSize: '.64rem', margin: 0 }}>⚠ Never share. Store securely.</span>
            </div>
          </div>
        )}
      </div>

      {/* Register */}
      <div className="glass-card flow">
        <div className="section-title">Register keys on issuance</div>
        <div className="field">
          <label>MPT Issuance ID</label>
          <input type="text" placeholder="0000000… (hex)" className="mono"
            value={issuanceID} onChange={e => setIssuanceID(e.target.value)} />
        </div>
        <div className="field">
          <label>Issuer encryption public key</label>
          <input type="text" placeholder="EC-ElGamal public key (hex)" className="mono"
            value={issuerPubKey} onChange={e => setIssuerPubKey(e.target.value)} />
        </div>
        <div className="field">
          <label>Auditor encryption public key (optional — permanent once set)</label>
          <input type="text" placeholder="EC-ElGamal public key (hex) — leave blank if no auditor"
            className="mono" value={auditorPubKey} onChange={e => setAuditorPubKey(e.target.value)} />
        </div>
        <div className="alert alert-warning">
          Key registration is <strong>permanent</strong>. Neither key can be changed or removed
          after registration. The auditor key must be registered in the same transaction as the
          issuer key — there is no second chance.
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {info  && <div className="alert alert-success">{info}</div>}
        <button className="btn btn-primary btn-full" onClick={registerKeys} disabled={loading || !wallet}>
          {loading ? <><span className="spinner" />&nbsp;Registering…</> : 'Register encryption keys'}
        </button>
      </div>
      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Distribute panel ────────────────────────────────────────────────────────

function DistributePanel({ issuanceID: propID }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [issuanceID, setIssuanceID] = useState(propID || '')
  const [holderAddr, setHolderAddr] = useState('')
  const [amount,     setAmount]     = useState('')

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [info,      setInfo]      = useState('')
  const [txResult,  setTxResult]  = useState(null)

  const authorize = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    if (!holderAddr.trim()) { setError('Holder address required.'); return }
    if (!issuanceID.trim()) { setError('Issuance ID required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      // Holder must call MPTokenAuthorize to opt in
      const result = await c.submitAndWait({
        TransactionType: 'MPTokenAuthorize',
        Account: holderAddr.trim(),
        MPTokenIssuanceID: issuanceID.trim(),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPTokenAuthorize', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo(`${holderAddr.slice(0,10)}… authorized to hold the MPT.`)
    } catch (e) { setError('MPTokenAuthorize failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const send = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    if (!holderAddr.trim() || !amount.trim() || !issuanceID.trim()) { setError('All fields required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'Payment',
        Account: wallet.address,
        Destination: holderAddr.trim(),
        Amount: {
          mpt_issuance_id: issuanceID.trim(),
          value: amount.trim(),
        },
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'MPT Payment (public)', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo(`${amount} tokens sent to ${holderAddr.slice(0,10)}… (public balance — convert to confidential next).`)
    } catch (e) { setError('Payment failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flow">
      <div className="ct-info-box">
        <strong>Step 3 — Authorize &amp; distribute</strong>: The holder must authorize the
        MPT on their account before receiving tokens. Tokens are sent as a public
        (plaintext) balance first, then converted to confidential in Step 4.
      </div>
      <div className="glass-card flow">
        <div className="section-title">Authorize holder</div>
        <p className="muted">Authorize a holder account to receive the MPT (MPTokenAuthorize).</p>
        <div className="field">
          <label>MPT Issuance ID</label>
          <input type="text" placeholder="0000000… (hex)" className="mono"
            value={issuanceID} onChange={e => setIssuanceID(e.target.value)} />
        </div>
        <div className="field">
          <label>Holder address</label>
          <input type="text" placeholder="r… account to authorize"
            value={holderAddr} onChange={e => setHolderAddr(e.target.value)} />
        </div>
        <button className="btn btn-secondary btn-full" onClick={authorize} disabled={loading || !wallet}>
          {loading ? <><span className="spinner" />&nbsp;Authorizing…</> : 'Authorize holder'}
        </button>
      </div>
      <div className="glass-card flow">
        <div className="section-title">Send public tokens</div>
        <p className="muted">Send a public (visible) amount to the holder. This is the ceiling for their future confidential balance.</p>
        <div className="field">
          <label>Amount</label>
          <input type="number" placeholder="0" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        {info  && <div className="alert alert-success">{info}</div>}
        <button className="btn btn-primary btn-full" onClick={send} disabled={loading || !wallet}>
          {loading ? <><span className="spinner" />&nbsp;Sending…</> : 'Send public tokens'}
        </button>
      </div>
      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Convert & Merge panel ───────────────────────────────────────────────────

function ConvertPanel({ issuanceID: propID }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [tab,        setTab]        = useState('convert')
  const [issuanceID, setIssuanceID] = useState(propID || '')
  const [holderSeed, setHolderSeed] = useState('')
  const [amount,     setAmount]     = useState('')

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [info,      setInfo]      = useState('')
  const [txResult,  setTxResult]  = useState(null)

  const convert = async () => {
    const seed = (holderSeed || wallet?.seed || '').trim()
    if (!seed) { setError('Holder seed required.'); return }
    if (!issuanceID.trim()) { setError('Issuance ID required.'); return }
    if (!amount.trim()) { setError('Amount required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const holderWallet = xrpl.Wallet.fromSeed(seed)

      const { deriveConfidentialKeypair, prepareConfidentialConvert } = xrplLib
      if (typeof prepareConfidentialConvert !== 'function') {
        setError('prepareConfidentialConvert not available. Upgrade to xrpl.js v5.1+.')
        setLoading(false); return
      }
      const holderKeypair = deriveConfidentialKeypair(seed)

      // prepareConfidentialConvert reads issuer/auditor keys from the ledger
      const convertTx = await prepareConfidentialConvert(c, {
        account:      holderWallet.address,
        mptIssuanceID: issuanceID.trim(),
        amount:       BigInt(amount.trim()),
        holderKeypair,
      })

      const result = await c.submitAndWait(convertTx, { wallet: holderWallet, autofill: true })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'ConfidentialMPTConvert', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo('Converted to confidential balance. Run Merge Inbox to move it to spending.')
    } catch (e) { setError('Convert failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const merge = async () => {
    const seed = (holderSeed || wallet?.seed || '').trim()
    if (!seed) { setError('Holder seed required.'); return }
    if (!issuanceID.trim()) { setError('Issuance ID required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const holderWallet = xrpl.Wallet.fromSeed(seed)

      const { prepareConfidentialMergeInbox } = xrplLib
      if (typeof prepareConfidentialMergeInbox !== 'function') {
        setError('prepareConfidentialMergeInbox not available. Upgrade to xrpl.js v5.1+.')
        setLoading(false); return
      }

      const mergeTx = await prepareConfidentialMergeInbox(c, {
        account:      holderWallet.address,
        mptIssuanceID: issuanceID.trim(),
      })

      const result = await c.submitAndWait(mergeTx, { wallet: holderWallet, autofill: true })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'ConfidentialMPTMergeInbox', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo('Inbox merged into spending balance. Ready to send confidential payments.')
    } catch (e) { setError('Merge failed: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flow">
      <div className="ct-info-box">
        <strong>Steps 4 &amp; 5 — Convert &amp; merge</strong>:
        Convert a public balance to confidential (inbox). Then merge the inbox into
        the spending balance. The split-bucket design prevents incoming payments from
        invalidating proofs already being built.
      </div>

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar">
          <button className={'tab-btn' + (tab === 'convert' ? ' tab-btn-active' : '')} onClick={() => setTab('convert')}>Convert</button>
          <button className={'tab-btn' + (tab === 'merge'   ? ' tab-btn-active' : '')} onClick={() => setTab('merge')}>Merge inbox</button>
        </div>
      </div>

      <div className="glass-card flow">
        <div className="field">
          <label>MPT Issuance ID</label>
          <input type="text" placeholder="0000000… (hex)" className="mono"
            value={issuanceID} onChange={e => setIssuanceID(e.target.value)} />
        </div>
        <div className="field">
          <label>Holder seed (leave blank to use active wallet)</label>
          <input type="text" placeholder="s… holder's seed"
            value={holderSeed} onChange={e => setHolderSeed(e.target.value)} />
        </div>

        {tab === 'convert' && (
          <>
            <div className="section-title">Convert public → confidential</div>
            <p className="muted">
              Encrypts the amount under the holder's, issuer's, and auditor's keys and posts it
              to the holder's inbox. The conversion amount is still publicly visible — only
              subsequent sends are masked.
            </p>
            <div className="field">
              <label>Amount to convert (integer)</label>
              <input type="number" placeholder="0" min="1" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            {info  && <div className="alert alert-success">{info}</div>}
            <div className="alert alert-warning">
              Submit immediately after building — the proof commits to the account's current
              sequence number. Any other transaction from this account first will invalidate it.
            </div>
            <button className="btn btn-primary btn-full" onClick={convert} disabled={loading || !wallet}>
              {loading ? <><span className="spinner" />&nbsp;Converting…</> : 'Convert to confidential'}
            </button>
          </>
        )}

        {tab === 'merge' && (
          <>
            <div className="section-title">Merge inbox → spending</div>
            <p className="muted">
              Moves the inbox balance into the spending balance, making it available
              for confidential sends. Each merge increments the ConfidentialBalanceVersion.
            </p>
            {error && <div className="alert alert-danger">{error}</div>}
            {info  && <div className="alert alert-success">{info}</div>}
            <button className="btn btn-primary btn-full" onClick={merge} disabled={loading || !wallet}>
              {loading ? <><span className="spinner" />&nbsp;Merging…</> : 'Merge inbox into spending'}
            </button>
          </>
        )}
      </div>
      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Inspect / Decrypt panel ─────────────────────────────────────────────────

function InspectPanel({ issuanceID: propID }) {
  const { xrpl, wallet, ensureConnected } = useXrpl()

  const [issuanceID,   setIssuanceID]   = useState(propID || '')
  const [holderAddr,   setHolderAddr]   = useState('')
  const [decryptKey,   setDecryptKey]   = useState('')  // private key for decryption

  const [mptoken,      setMptoken]      = useState(null)
  const [mptIssuance,  setMptIssuance]  = useState(null)
  const [decrypted,    setDecrypted]    = useState(null)

  const [loading,      setLoading]      = useState(false)
  const [decrypting,   setDecrypting]   = useState(false)
  const [error,        setError]        = useState('')
  const [decryptError, setDecryptError] = useState('')

  const fetch = useCallback(async () => {
    const addr = (holderAddr || wallet?.address || '').trim()
    if (!addr || !issuanceID.trim()) { setError('Holder address and issuance ID required.'); return }
    setLoading(true); setError(''); setMptoken(null); setMptIssuance(null); setDecrypted(null)
    try {
      const c = await ensureConnected()
      const { fetchMPToken, fetchMPTokenIssuance } = xrplLib
      const [tok, iss] = await Promise.all([
        typeof fetchMPToken === 'function' ? fetchMPToken(c, addr, issuanceID.trim()) : null,
        typeof fetchMPTokenIssuance === 'function' ? fetchMPTokenIssuance(c, issuanceID.trim()) : null,
      ])
      setMptoken(tok)
      setMptIssuance(iss)
    } catch (e) { setError('Fetch failed: ' + e.message) }
    finally { setLoading(false) }
  }, [holderAddr, wallet, issuanceID, ensureConnected])

  const decrypt = async (field) => {
    if (!mptoken || !mptIssuance) { setDecryptError('Fetch the MPToken entry first.'); return }
    const pk = decryptKey.trim()
    if (!pk) { setDecryptError('Private key required for decryption.'); return }
    setDecrypting(true); setDecryptError(''); setDecrypted(null)
    try {
      const { loadMptCrypto } = xrplLib
      if (typeof loadMptCrypto !== 'function') {
        setDecryptError('loadMptCrypto not available. Upgrade to xrpl.js v5.1+.')
        return
      }
      const crypto = await loadMptCrypto()
      const ciphertext = mptoken[field]
      if (!ciphertext) { setDecryptError(`No ${field} on this MPToken entry.`); return }
      const confidentialSupply = BigInt(mptIssuance.ConfidentialOutstandingAmount ?? 0)
      const amount = await crypto.decryptAmount(ciphertext, pk, confidentialSupply)
      setDecrypted({ field, amount: amount.toString() })
    } catch (e) { setDecryptError('Decryption failed: ' + e.message) }
    finally { setDecrypting(false) }
  }

  const tokenKeys = mptoken ? Object.keys(mptoken).filter(k =>
    k.startsWith('Confidential') || k === 'AuditorEncryptedBalance'
  ) : []

  return (
    <div className="flow">
      <div className="ct-info-box">
        <strong>Step 6 — Inspect &amp; decrypt</strong>: Fetch the MPToken entry for a holder.
        Parties holding a matching private key can decrypt the ciphertext fields to verify
        balances. Everyone else sees only encrypted data.
      </div>
      <div className="glass-card flow">
        <div className="section-title">Fetch MPToken entry</div>
        <div className="field">
          <label>MPT Issuance ID</label>
          <input type="text" placeholder="0000000… (hex)" className="mono"
            value={issuanceID} onChange={e => setIssuanceID(e.target.value)} />
        </div>
        <div className="field">
          <label>Holder address (blank = active wallet)</label>
          <input type="text" placeholder="r… or leave blank"
            value={holderAddr} onChange={e => setHolderAddr(e.target.value)} />
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-secondary btn-full" onClick={fetch} disabled={loading}>
          {loading ? <><span className="spinner" />&nbsp;Fetching…</> : 'Fetch token entry'}
        </button>
      </div>

      {mptoken && (
        <div className="glass-card fade-in flow">
          <div className="section-title">MPToken entry</div>
          <div className="result-box">{JSON.stringify(mptoken, null, 2)}</div>

          {tokenKeys.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 8 }}>Decrypt a balance field</div>
              <p className="muted">Provide your EC-ElGamal private key to decrypt a ciphertext field.</p>
              <div className="field">
                <label>EC-ElGamal private key</label>
                <input type="text" placeholder="Private key (hex) — never share"
                  value={decryptKey} onChange={e => setDecryptKey(e.target.value)}
                  className="mono" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tokenKeys.map(k => (
                  <button key={k} className="btn btn-secondary btn-sm"
                    onClick={() => decrypt(k)} disabled={decrypting}>
                    Decrypt {k.replace('Confidential', '').replace('Balance', ' balance')}
                  </button>
                ))}
              </div>
              {decryptError && <div className="alert alert-danger">{decryptError}</div>}
              {decrypted && (
                <div className="ct-decrypt-result fade-in">
                  <span className="ct-decrypt-label">{decrypted.field.replace('Confidential', '').replace('Balance', ' Balance')}</span>
                  <span className="ct-decrypt-value">{Number(decrypted.amount).toLocaleString()}</span>
                  <span className="ct-decrypt-hint">tokens (decrypted)</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

const OUTER_TABS = [
  { key: 'issue',     label: '1 Issue'     },
  { key: 'keys',      label: '2 Keys'      },
  { key: 'distribute',label: '3 Distribute'},
  { key: 'convert',   label: '4/5 Convert' },
  { key: 'inspect',   label: '6 Inspect'   },
]

function RailNotice() {
  const { network, connected, featureEnabled } = useXrpl()
  const enabled = featureEnabled('ConfidentialTransfer')
  if (enabled === true) {
    return <div className="alert alert-success" style={{ marginBottom: 12 }}>Confidential transfers are enabled on {network}.</div>
  }
  if (enabled === false) {
    return <div className="alert alert-warning" style={{ marginBottom: 12 }}>ConfidentialTransfer is not enabled on {network}. A transaction here will be rejected.</div>
  }
  return (
    <div className="alert alert-info" style={{ marginBottom: 12 }}>
      {connected
        ? `ConfidentialTransfer status is not available on ${network} yet. The form stays open.`
        : `Checking ConfidentialTransfer on ${network}.`}
    </div>
  )
}

export default function ConfidentialTokensPage() {
  const [tab,        setTab]        = useState('issue')
  const [issuanceID, setIssuanceID] = useState('')

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-kicker">Confidential Tokens · XLS-96</div>
        <h2>Encrypted on-ledger balances</h2>
        <p>
          Issue MPTs with EC-ElGamal encrypted balances. Transfer amounts stay masked
          on-chain while issuers and designated auditors retain selective access — full
          privacy for holders, full oversight for compliance.
        </p>
      </div>

      {/* Amendment notice */}
      <RailNotice />

      <div className="grid-2">
        <div className="flow">
          {/* Step tabs */}
          <div className="glass-card" style={{ padding: '4px 8px' }}>
            <div className="tab-bar">
              {OUTER_TABS.map(t => (
                <button key={t.key}
                  className={'tab-btn' + (tab === t.key ? ' tab-btn-active' : '')}
                  onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'issue'      && <IssuePanel      onIssued={id => { setIssuanceID(id); setTab('keys') }} />}
          {tab === 'keys'       && <KeysPanel       issuanceID={issuanceID} />}
          {tab === 'distribute' && <DistributePanel issuanceID={issuanceID} />}
          {tab === 'convert'    && <ConvertPanel    issuanceID={issuanceID} />}
          {tab === 'inspect'    && <InspectPanel    issuanceID={issuanceID} />}
        </div>

        {/* Right column */}
        <div className="flow">
          <WalletCard />

          {/* Issuance ID carry-over */}
          {issuanceID && (
            <div className="glass-card">
              <div className="subsection-label">Active issuance ID</div>
              <div className="ct-issuance-id mono">{issuanceID}</div>
            </div>
          )}

          {/* Concept guide */}
          <div className="glass-card">
            <div className="section-title">How it works</div>
            <ul className="ms-notes" style={{ marginTop: 8 }}>
              <li>Balances are encrypted with EC-ElGamal over secp256k1</li>
              <li>Each participant holds a separate encryption keypair from their signing key</li>
              <li>The issuer and auditor can decrypt any balance with their registered key</li>
              <li>Incoming payments land in the inbox; merge to make them spendable</li>
              <li>TransferFee must be 0 — fees cannot be computed on encrypted amounts</li>
              <li>Key registration is permanent — choose your auditor before registering</li>
              <li>The issuer must use a second account to hold confidential balances of their own token</li>
            </ul>
          </div>

          {/* Split-balance diagram */}
          <div className="glass-card">
            <div className="section-title">Split-balance model</div>
            <div className="ct-balance-diagram">
              <div className="ct-balance-bucket ct-bucket-inbox">
                <span className="ct-bucket-label">Inbox</span>
                <span className="ct-bucket-sub">Receives incoming<br/>payments &amp; conversions</span>
              </div>
              <div className="ct-balance-arrow">→ merge →</div>
              <div className="ct-balance-bucket ct-bucket-spend">
                <span className="ct-bucket-label">Spending</span>
                <span className="ct-bucket-sub">Available to<br/>ConfidentialMPTSend</span>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              The split prevents incoming payments from invalidating a proof
              already being built against the spending balance.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
