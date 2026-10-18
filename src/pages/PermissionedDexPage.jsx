/**
 * PermissionedDexPage
 *
 * Implements the full Permissioned DEX workflow (XLS-81):
 *
 *  1. Credentials  — CredentialCreate / CredentialAccept / CredentialDelete
 *  2. Domains      — PermissionedDomainSet (create/update) / PermissionedDomainDelete
 *  3. Trading      — OfferCreate with DomainID (permissioned or hybrid)
 *                    account_offers query, OfferCancel
 *
 * Requires: PermissionedDEX + PermissionedDomains + Credentials amendments (devnet).
 */

import { useState, useEffect, useCallback } from 'react'
import TokenSelect from '../components/TokenSelect'
import { amountOf, defaultTokenId, tokenById } from '../lib/tokens'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxModal from '../components/TxModal'

// ─── helpers ─────────────────────────────────────────────────────────────────

function toHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function fromHex(hex) {
  try {
    const bytes = hex.match(/.{1,2}/g) || []
    return new TextDecoder().decode(new Uint8Array(bytes.map(b => parseInt(b, 16))))
  } catch {
    return hex
  }
}

function fmtAmt(a) {
  if (!a) return '—'
  return typeof a === 'string'
    ? (Number(a) / 1e6).toFixed(6) + ' XRP'
    : `${a.value} ${a.currency}`
}

// ─── Credentials panel ───────────────────────────────────────────────────────

function CredentialsPanel() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [tab, setTab] = useState('create')

  // Create fields
  const [subject,     setSubject]     = useState('')
  const [credType,    setCredType]    = useState('KYC-Verified')
  const [credTypeRaw, setCredTypeRaw] = useState(false)
  const [expiry,      setExpiry]      = useState('')
  const [uri,         setUri]         = useState('')

  // Accept fields
  const [acceptIssuer,   setAcceptIssuer]   = useState('')
  const [acceptCredType, setAcceptCredType] = useState('')

  // Delete fields
  const [delSubject,   setDelSubject]   = useState('')
  const [delCredType,  setDelCredType]  = useState('')

  // Lookup fields
  const [lookupAcct,  setLookupAcct]  = useState('')
  const [credentials, setCredentials] = useState([])
  const [lookupLoading, setLookupLoading] = useState(false)

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [info,      setInfo]      = useState('')
  const [txResult,  setTxResult]  = useState(null)

  const credTypeHex = credTypeRaw ? credType.trim() : toHex(credType.trim())

  const createCredential = async () => {
    if (!wallet) { setError('Open an account first — Bank tab.'); return }
    if (!subject.trim()) { setError('Subject address required.'); return }
    if (!credType.trim()) { setError('Credential type required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'CredentialCreate',
        Account: wallet.address,
        Subject: subject.trim(),
        CredentialType: credTypeHex,
      }
      if (expiry) tx.Expiration = Math.floor(new Date(expiry).getTime() / 1000) - 946684800
      if (uri.trim()) tx.URI = toHex(uri.trim())

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'CredentialCreate', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo(`Credential "${credType}" issued to ${subject.slice(0, 10)}…`)
    } catch (e) { setError('CredentialCreate failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const acceptCredential = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    if (!acceptIssuer.trim() || !acceptCredType.trim()) { setError('Issuer and credential type required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'CredentialAccept',
        Account: wallet.address,
        Issuer: acceptIssuer.trim(),
        CredentialType: toHex(acceptCredType.trim()),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'CredentialAccept', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo('Credential accepted.')
    } catch (e) { setError('CredentialAccept failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const deleteCredential = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    if (!delSubject.trim() || !delCredType.trim()) { setError('Subject and credential type required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'CredentialDelete',
        Account: wallet.address,
        Subject: delSubject.trim(),
        CredentialType: toHex(delCredType.trim()),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'CredentialDelete', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo('Credential deleted.')
    } catch (e) { setError('CredentialDelete failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const lookupCredentials = useCallback(async () => {
    const addr = (lookupAcct || wallet?.address || '').trim()
    if (!addr) { setError('Address required for lookup.'); return }
    setLookupLoading(true); setError(''); setCredentials([])
    try {
      const c = await ensureConnected()
      const r = await c.request({
        command: 'account_objects',
        account: addr,
        type: 'credential',
        ledger_index: 'validated',
      })
      setCredentials(r.result.account_objects ?? [])
    } catch (e) { setError('Lookup failed: ' + e.message) }
    finally { setLookupLoading(false) }
  }, [lookupAcct, wallet, ensureConnected])

  return (
    <div className="flow">
      {/* Info bar */}
      <div className="pdex-info-box">
        <strong>Credentials (XLS-80/81)</strong> — Issuers create credentials for subjects (holders).
        Subjects accept them. Credentials grant access to permissioned domains and their DEXes.
        Credential types are stored on-chain as hex-encoded UTF-8 strings.
      </div>

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar">
          {[['create','Issue'], ['accept','Accept'], ['delete','Revoke'], ['lookup','Lookup']].map(([k,l]) => (
            <button key={k} className={'tab-btn' + (tab === k ? ' tab-btn-active' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {info  && <div className="alert alert-success">{info}</div>}

      {tab === 'create' && (
        <div className="glass-card flow">
          <div className="section-title">Issue a credential</div>
          <p className="muted">As the issuer, create a credential for a subject account. The subject must accept it before it becomes valid.</p>
          <div className="field">
            <label>Subject address (credential recipient)</label>
            <input type="text" placeholder="r… account to receive the credential"
              value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Credential type</label>
              <input type="text" placeholder={credTypeRaw ? 'hex e.g. 4B59432D…' : 'e.g. KYC-Verified'}
                value={credType} onChange={e => setCredType(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <label>Raw hex input</label>
              <label className="flag-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={credTypeRaw} onChange={e => setCredTypeRaw(e.target.checked)} />
                <span className="flag-label">Use raw hex</span>
              </label>
            </div>
          </div>
          {!credTypeRaw && credType && (
            <div className="pdex-hex-preview">Hex: {credTypeHex}</div>
          )}
          <div className="field-row">
            <div className="field">
              <label>Expiry (optional)</label>
              <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
            </div>
            <div className="field">
              <label>URI (optional)</label>
              <input type="text" placeholder="https://kyc-doc.example.com/…"
                value={uri} onChange={e => setUri(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-full" onClick={createCredential} disabled={loading || !wallet}>
            {loading ? <><span className="spinner" />&nbsp;Issuing…</> : 'Issue credential'}
          </button>
        </div>
      )}

      {tab === 'accept' && (
        <div className="glass-card flow">
          <div className="section-title">Accept a credential</div>
          <p className="muted">Accept a credential that has been issued to your account. It is not valid until accepted.</p>
          <div className="field">
            <label>Issuer address</label>
            <input type="text" placeholder="r… credential issuer"
              value={acceptIssuer} onChange={e => setAcceptIssuer(e.target.value)} />
          </div>
          <div className="field">
            <label>Credential type (plain text)</label>
            <input type="text" placeholder="e.g. KYC-Verified"
              value={acceptCredType} onChange={e => setAcceptCredType(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={acceptCredential} disabled={loading || !wallet}>
            {loading ? <><span className="spinner" />&nbsp;Accepting…</> : 'Accept credential'}
          </button>
        </div>
      )}

      {tab === 'delete' && (
        <div className="glass-card flow">
          <div className="section-title">Revoke a credential</div>
          <p className="muted">Issuers can delete credentials they issued. Subjects can also delete credentials they hold.</p>
          <div className="field">
            <label>Subject address</label>
            <input type="text" placeholder="r… subject whose credential to revoke"
              value={delSubject} onChange={e => setDelSubject(e.target.value)} />
          </div>
          <div className="field">
            <label>Credential type (plain text)</label>
            <input type="text" placeholder="e.g. KYC-Verified"
              value={delCredType} onChange={e => setDelCredType(e.target.value)} />
          </div>
          <button className="btn btn-danger btn-full" onClick={deleteCredential} disabled={loading || !wallet}>
            {loading ? <><span className="spinner" />&nbsp;Revoking…</> : 'Revoke credential'}
          </button>
        </div>
      )}

      {tab === 'lookup' && (
        <div className="glass-card flow">
          <div className="section-title">Look up credentials</div>
          <div className="field-row">
            <div className="field">
              <label>Account address (leave blank for own)</label>
              <input type="text" placeholder="r… or leave blank"
                value={lookupAcct} onChange={e => setLookupAcct(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={lookupCredentials} disabled={lookupLoading}>
                {lookupLoading ? <span className="spinner" /> : 'Fetch'}
              </button>
            </div>
          </div>
          {credentials.length === 0 ? (
            <div className="muted">{lookupLoading ? 'Loading…' : 'No credentials found.'}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Issuer</th><th>Subject</th><th>Type (decoded)</th><th>Accepted</th></tr>
              </thead>
              <tbody>
                {credentials.map((c, i) => (
                  <tr key={i}>
                    <td className="address mono" style={{ fontSize: '.68rem' }}>{c.Issuer?.slice(0,8)}…</td>
                    <td className="address mono" style={{ fontSize: '.68rem' }}>{c.Subject?.slice(0,8)}…</td>
                    <td>{fromHex(c.CredentialType || '')}</td>
                    <td>{c.Flags & 0x00010000 ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--yellow)' }}>pending</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Domains panel ────────────────────────────────────────────────────────────

function DomainsPanel({ onDomainSet }) {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  const [tab, setTab] = useState('create')

  // Create/update
  const [domainID,    setDomainID]    = useState('')        // empty = create new
  const [credentials, setCredentials] = useState([
    { issuer: '', credType: '' },
  ])

  // Delete
  const [delDomainID, setDelDomainID] = useState('')

  // Lookup
  const [domains,        setDomains]        = useState([])
  const [lookupLoading,  setLookupLoading]  = useState(false)

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [info,     setInfo]     = useState('')
  const [txResult, setTxResult] = useState(null)

  const addCredEntry  = () => setCredentials(p => [...p, { issuer: '', credType: '' }])
  const removeCredEntry = (i) => setCredentials(p => p.length <= 1 ? p : p.filter((_, idx) => idx !== i))
  const updateCredEntry = (i, f, v) => setCredentials(p => p.map((e, idx) => idx === i ? { ...e, [f]: v } : e))

  const setDomain = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    const validCreds = credentials.filter(c => c.issuer.trim() && c.credType.trim())
    if (validCreds.length === 0) { setError('At least one accepted credential (issuer + type) required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const tx = {
        TransactionType: 'PermissionedDomainSet',
        Account: wallet.address,
        AcceptedCredentials: validCreds.map(e => ({
          Credential: {
            Issuer:         e.issuer.trim(),
            CredentialType: toHex(e.credType.trim()),
          },
        })),
      }
      // If domainID provided → update existing domain
      if (domainID.trim()) tx.DomainID = domainID.trim()

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: domainID ? 'DomainUpdate' : 'DomainCreate', status: ok ? 'success' : 'error', hash: result.result.hash })

      if (ok) {
        let newDomainID = domainID.trim()
        if (!newDomainID) {
          // Extract Domain ID from tx metadata
          const nodes = result.result.meta?.AffectedNodes ?? []
          for (const n of nodes) {
            if (n.CreatedNode?.LedgerEntryType === 'PermissionedDomain') {
              newDomainID = n.CreatedNode.LedgerIndex
              break
            }
          }
        }
        const msg = domainID ? 'Domain updated.' : `Domain created. ID: ${newDomainID}`
        setInfo(msg)
        if (newDomainID && onDomainSet) onDomainSet(newDomainID)
        if (!domainID && newDomainID) setDomainID(newDomainID)
      }
    } catch (e) { setError('PermissionedDomainSet failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const deleteDomain = async () => {
    if (!wallet) { setError('Open an account first.'); return }
    if (!delDomainID.trim()) { setError('Domain ID required.'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'PermissionedDomainDelete',
        Account: wallet.address,
        DomainID: delDomainID.trim(),
      }, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'DomainDelete', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) setInfo('Domain deleted.')
    } catch (e) { setError('PermissionedDomainDelete failed: ' + e.message) }
    finally { setLoading(false) }
  }

  const lookupDomains = useCallback(async () => {
    const addr = wallet?.address
    if (!addr) { setError('Open an account first.'); return }
    setLookupLoading(true); setError(''); setDomains([])
    try {
      const c = await ensureConnected()
      const r = await c.request({
        command: 'account_objects',
        account: addr,
        type: 'permissioned_domain',
        ledger_index: 'validated',
      })
      setDomains(r.result.account_objects ?? [])
    } catch (e) { setError('Lookup failed: ' + e.message) }
    finally { setLookupLoading(false) }
  }, [wallet, ensureConnected])

  return (
    <div className="flow">
      <div className="pdex-info-box">
        <strong>Permissioned Domains (XLS-80)</strong> — A domain is an allow-list for a
        permissioned DEX. The owner defines which credential types grant access. The Domain ID
        is referenced when placing permissioned or hybrid offers.
      </div>

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar">
          {[['create','Create'], ['update','Update'], ['delete','Delete'], ['lookup','My Domains']].map(([k,l]) => (
            <button key={k} className={'tab-btn' + (tab === k ? ' tab-btn-active' : '')} onClick={() => { setTab(k); if (k === 'lookup') lookupDomains() }}>{l}</button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {info  && <div className="alert alert-success">{info}</div>}

      {(tab === 'create' || tab === 'update') && (
        <div className="glass-card flow">
          <div className="section-title">{tab === 'create' ? 'Create a permissioned domain' : 'Update a domain'}</div>
          {tab === 'update' && (
            <div className="field">
              <label>Domain ID (64-char hex)</label>
              <input type="text" placeholder="0A3B2C…" className="mono"
                value={domainID} onChange={e => setDomainID(e.target.value)} />
            </div>
          )}
          <div className="subsection-label">Accepted credentials (up to 10)</div>
          {credentials.map((e, i) => (
            <div className="pdex-cred-row" key={i}>
              <span className="ms-signer-index">{i + 1}</span>
              <div className="field" style={{ flex: 2 }}>
                <label>Issuer address</label>
                <input type="text" placeholder="r…"
                  value={e.issuer} onChange={v => updateCredEntry(i, 'issuer', v.target.value)} />
              </div>
              <div className="field" style={{ flex: 2 }}>
                <label>Credential type</label>
                <input type="text" placeholder="KYC-Verified"
                  value={e.credType} onChange={v => updateCredEntry(i, 'credType', v.target.value)} />
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginBottom: 10 }}
                onClick={() => removeCredEntry(i)} disabled={credentials.length <= 1}>✕</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={addCredEntry}
            disabled={credentials.length >= 10}>+ Add credential</button>
          <button className="btn btn-primary btn-full" onClick={setDomain} disabled={loading || !wallet}>
            {loading ? <><span className="spinner" />&nbsp;Submitting…</> : tab === 'create' ? 'Create domain' : 'Update domain'}
          </button>
        </div>
      )}

      {tab === 'delete' && (
        <div className="glass-card flow">
          <div className="section-title">Delete a domain</div>
          <p className="muted">Deleting a domain will immediately invalidate all permissioned offers referencing it.</p>
          <div className="field">
            <label>Domain ID</label>
            <input type="text" placeholder="0A3B2C… (64-char hex)" className="mono"
              value={delDomainID} onChange={e => setDelDomainID(e.target.value)} />
          </div>
          <button className="btn btn-danger btn-full" onClick={deleteDomain} disabled={loading || !wallet}>
            {loading ? <><span className="spinner" />&nbsp;Deleting…</> : 'Delete domain'}
          </button>
        </div>
      )}

      {tab === 'lookup' && (
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>My domains</div>
            <button className="btn btn-secondary btn-sm" onClick={lookupDomains} disabled={lookupLoading}>
              {lookupLoading ? <span className="spinner" /> : 'Refresh'}
            </button>
          </div>
          {domains.length === 0 ? (
            <div className="muted">{lookupLoading ? 'Loading…' : 'No permissioned domains found.'}</div>
          ) : (
            domains.map((d, i) => (
              <div key={i} className="pdex-domain-card">
                <div className="pdex-domain-id mono">{d.index ?? d.LedgerIndex ?? '—'}</div>
                <div className="pdex-domain-creds">
                  {(d.AcceptedCredentials ?? []).map((ac, j) => (
                    <span key={j} className="lp-chip" style={{ fontSize: '.65rem' }}>
                      {fromHex(ac.Credential?.CredentialType || '')} @ {(ac.Credential?.Issuer || '').slice(0, 8)}…
                    </span>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  onDomainSet?.(d.index ?? d.LedgerIndex)
                  setInfo(`Domain ID copied to trading tab: ${(d.index ?? d.LedgerIndex ?? '').slice(0,12)}…`)
                }}>Use in trading</button>
              </div>
            ))
          )}
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Trading panel ────────────────────────────────────────────────────────────

function TradingPanel({ domainID: propDomainID }) {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()

  const [tab, setTab] = useState('new')

  const [getsAmt, setGetsAmt] = useState('')
  const [getsId, setGetsId] = useState('XRP')
  const [paysAmt, setPaysAmt] = useState('')
  const [paysId, setPaysId] = useState(() => defaultTokenId(network, { allowXrp: false }) || 'XRP')

  // Permissioned DEX settings
  const [offerMode,  setOfferMode]  = useState('permissioned') // 'open' | 'permissioned' | 'hybrid'
  const [domainID,   setDomainID]   = useState(propDomainID || '')

  // Standard offer flags
  const [flagPassive,    setFlagPassive]    = useState(false)
  const [flagIoC,        setFlagIoC]        = useState(false)
  const [flagFillOrKill, setFlagFillOrKill] = useState(false)
  const [flagSell,       setFlagSell]       = useState(false)
  const [offerExpiry,    setOfferExpiry]    = useState('')

  // My orders
  const [offers,        setOffers]        = useState([])
  const [loadingOffers, setLoadingOffers] = useState(false)

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [txResult,  setTxResult]  = useState(null)

  // Sync domain from parent
  useEffect(() => { if (propDomainID) setDomainID(propDomainID) }, [propDomainID])

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

  const createOffer = async () => {
    if (!wallet)              { setError('Open an account first — Bank tab.'); return }
    const gets = tokenById(network, getsId)
    const pays = tokenById(network, paysId)
    if (!getsAmt || !paysAmt) { setError('Fill both sides of the order.'); return }
    if (!gets || !pays) { setError('Pick both assets from the directory.'); return }
    if (offerMode !== 'open' && !domainID.trim()) { setError('Domain ID required for permissioned/hybrid offers.'); return }

    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)

      // Build flags
      let flags = 0
      if (flagPassive)    flags |= 0x00010000
      if (flagIoC)        flags |= 0x00020000
      if (flagFillOrKill) flags |= 0x00040000
      if (flagSell)       flags |= 0x00080000
      if (offerMode === 'hybrid') flags |= 0x00200000 // tfHybrid

      const tx = {
        TransactionType: 'OfferCreate',
        Account: wallet.address,
        TakerGets: amountOf(xrpl, gets, getsAmt),
        TakerPays: amountOf(xrpl, pays, paysAmt),
      }
      if (flags) tx.Flags = flags
      if (offerMode !== 'open' && domainID.trim()) tx.DomainID = domainID.trim()
      if (offerExpiry) tx.Expiration = Math.floor(new Date(offerExpiry).getTime() / 1000) - 946684800

      const result = await c.submitAndWait(tx, { wallet: w })
      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({
        type: `OfferCreate (${offerMode})`,
        status: ok ? 'success' : 'error',
        amount: `${getsAmt} ${gets.code} → ${paysAmt} ${pays.code}`,
        hash: result.result.hash,
      })
      if (ok) { setTimeout(fetchOffers, 2500); setTab('open') }
    } catch (e) { setError("Order didn't place: " + e.message) }
    finally { setLoading(false) }
  }

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

  useEffect(() => { if (wallet && tab === 'open') fetchOffers() }, [wallet, tab, fetchOffers])

  return (
    <div className="flow">
      <div className="pdex-info-box">
        <strong>Offer types:</strong> <em>Open</em> — standard open DEX (unchanged).&nbsp;
        <em>Permissioned</em> — domain-only; only credentialed accounts can match.&nbsp;
        <em>Hybrid</em> — can match offers in both the permissioned DEX and the open DEX.
        Note: permissioned offers are not compatible with AMMs.
      </div>

      <div className="glass-card" style={{ padding: '4px 8px' }}>
        <div className="tab-bar">
          <button className={'tab-btn' + (tab === 'new'  ? ' tab-btn-active' : '')} onClick={() => setTab('new')}>New order</button>
          <button className={'tab-btn' + (tab === 'open' ? ' tab-btn-active' : '')} onClick={() => { setTab('open'); fetchOffers() }}>Open orders</button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {tab === 'new' && (
        <div className="flow">
          {!wallet && <div className="alert alert-warning">Open a book first — Bank tab.</div>}

          {/* Offer mode */}
          <div className="glass-card">
            <div className="section-title">Order type</div>
            <div className="pdex-mode-grid">
              {[
                { key: 'open',         label: 'Open',         hint: 'Standard open DEX — no restrictions' },
                { key: 'permissioned', label: 'Permissioned', hint: 'Domain only — credentialed traders only' },
                { key: 'hybrid',       label: 'Hybrid',       hint: 'Matches both the permissioned DEX and open DEX' },
              ].map(m => (
                <button key={m.key}
                  className={'pdex-mode-btn' + (offerMode === m.key ? ' pdex-mode-btn-active' : '')}
                  onClick={() => setOfferMode(m.key)}>
                  <span className="pdex-mode-label">{m.label}</span>
                  <span className="pdex-mode-hint">{m.hint}</span>
                </button>
              ))}
            </div>
            {offerMode !== 'open' && (
              <div className="field" style={{ marginTop: 10 }}>
                <label>Domain ID (64-char hex)</label>
                <input type="text" placeholder="0A3B2C… — from your Domains tab" className="mono"
                  value={domainID} onChange={e => setDomainID(e.target.value)} />
              </div>
            )}
          </div>

          {/* Amount panels */}
          <div className="glass-card">
            <div className="subsection-label">You sell (TakerGets)</div>
            <div className="field-row">
              <div className="field">
                <label>Amount</label>
                <input type="number" placeholder="0.00" value={getsAmt} onChange={e => setGetsAmt(e.target.value)} min="0" step="any" />
              </div>
              <TokenSelect network={network} tokenId={getsId} label="Asset" onChange={token => setGetsId(token.id)} />
            </div>
          </div>

          <div className="swap-mark">⇅</div>

          <div className="glass-card">
            <div className="subsection-label">You buy (TakerPays)</div>
            <div className="field-row">
              <div className="field">
                <label>Amount</label>
                <input type="number" placeholder="0.00" value={paysAmt} onChange={e => setPaysAmt(e.target.value)} min="0" step="any" />
              </div>
              <TokenSelect network={network} tokenId={paysId} label="Asset" onChange={token => setPaysId(token.id)} />
            </div>
          </div>

          {/* Flags */}
          <div className="glass-card">
            <div className="section-title">Order flags</div>
            <div className="flags-grid">
              <label className="flag-row">
                <input type="checkbox" checked={flagPassive} onChange={e => setFlagPassive(e.target.checked)} />
                <span className="flag-label">Passive</span>
                <span className="flag-hint">Don't consume crossing offers — sit on book only.</span>
              </label>
              <label className="flag-row">
                <input type="checkbox" checked={flagIoC} onChange={e => setFlagIoC(e.target.checked)} />
                <span className="flag-label">Immediate or Cancel</span>
                <span className="flag-hint">Fill available immediately, cancel the rest.</span>
              </label>
              <label className="flag-row">
                <input type="checkbox" checked={flagFillOrKill} onChange={e => setFlagFillOrKill(e.target.checked)} />
                <span className="flag-label">Fill or Kill</span>
                <span className="flag-hint">Execute fully or not at all.</span>
              </label>
              <label className="flag-row">
                <input type="checkbox" checked={flagSell} onChange={e => setFlagSell(e.target.checked)} />
                <span className="flag-label">Sell</span>
                <span className="flag-hint">Sell exact TakerGets regardless of rate.</span>
              </label>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Expiry date (optional)</label>
              <input type="date" value={offerExpiry} onChange={e => setOfferExpiry(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={createOffer} disabled={loading || !wallet}>
            {loading ? <><span className="spinner" />&nbsp;Placing…</> : `Place ${offerMode} order`}
          </button>
        </div>
      )}

      {tab === 'open' && (
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Open orders</div>
            <button className="btn btn-secondary btn-sm" onClick={fetchOffers} disabled={loadingOffers}>
              {loadingOffers ? <span className="spinner" /> : 'Refresh'}
            </button>
          </div>
          {!wallet ? (
            <div className="alert alert-warning">Open a book to see orders.</div>
          ) : offers.length === 0 ? (
            <div className="muted">{loadingOffers ? 'Loading…' : 'No open orders.'}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Seq</th><th>Sell</th><th>Buy</th><th>Quality</th><th>Domain</th><th></th></tr>
              </thead>
              <tbody>
                {offers.map((o, i) => (
                  <tr key={i}>
                    <td className="mono">#{o.seq}</td>
                    <td>{fmtAmt(o.taker_gets)}</td>
                    <td>{fmtAmt(o.taker_pays)}</td>
                    <td className="mono">{Number(o.quality).toExponential(4)}</td>
                    <td className="mono" style={{ fontSize: '.64rem', color: 'var(--txt3)' }}>
                      {o.domain_id ? o.domain_id.slice(0, 8) + '…' : <span style={{ color: 'var(--txt3)' }}>open</span>}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => cancelOffer(o.seq)} disabled={loading}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {txResult && <TxModal tx={txResult} onClose={() => setTxResult(null)} />}
    </div>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

const OUTER_TABS = [
  { key: 'credentials', label: 'Credentials' },
  { key: 'domains',     label: 'Domains'     },
  { key: 'trading',     label: 'Trading'     },
]

export default function PermissionedDexPage() {
  const [tab,       setTab]       = useState('credentials')
  const [domainID,  setDomainID]  = useState('')  // flows from Domains → Trading

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-kicker">Permissioned DEX · XLS-81</div>
        <h2>Compliance-native trading</h2>
        <p>
          Create credential-gated order books where only vetted counterparties can trade.
          Issue credentials, configure permissioned domains, then place open, permissioned,
          or hybrid orders — all enforced at the protocol level.
        </p>
      </div>

      {/* Amendment notice */}
      <div className="alert alert-warning" style={{ marginBottom: 12 }}>
        ⚠ Requires the <strong>PermissionedDEX</strong>, <strong>PermissionedDomains</strong>, and&nbsp;
        <strong>Credentials</strong> amendments. Currently available on <strong>devnet</strong> only.
        Transactions will fail on testnet/mainnet until these amendments activate.
      </div>

      <div className="grid-2">
        <div className="flow">
          {/* Outer tab selector */}
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

          {tab === 'credentials' && <CredentialsPanel />}
          {tab === 'domains'     && <DomainsPanel onDomainSet={id => { setDomainID(id); setTab('trading') }} />}
          {tab === 'trading'     && <TradingPanel domainID={domainID} />}
        </div>

        {/* Right: wallet card */}
        <div className="flow">
          <WalletCard />
          {/* Concept summary */}
          <div className="glass-card">
            <div className="section-title">How permissioned DEX works</div>
            <ul className="ms-notes" style={{ marginTop: 8 }}>
              <li>Credential issuers vet and approve accounts (CredentialCreate → CredentialAccept)</li>
              <li>Domain owners define which credentials grant trading access</li>
              <li>Permissioned offers only match others in the same domain</li>
              <li>Hybrid offers can match both the permissioned DEX and the open DEX</li>
              <li>A credential expiry or revocation immediately invalidates that account's offers</li>
              <li>AMMs are incompatible with permissioned DEX — use order books only</li>
            </ul>
            {domainID && (
              <div style={{ marginTop: 12 }}>
                <div className="subsection-label">Active domain</div>
                <div className="pdex-hex-preview mono" style={{ wordBreak: 'break-all' }}>{domainID}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
