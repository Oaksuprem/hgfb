/**
 * MultisignPage — General-Purpose Multi-Signature Tool
 *
 * Two tabs:
 *   Signer List  — Install / view / delete a SignerList on any account.
 *                  Up to 8 signers with individual weights and a configurable quorum.
 *   Sign & Send  — Build any XRPL transaction, collect up to 8 independent
 *                  signatures, combine via multisign(), and broadcast.
 *
 * All state lives in useMultisign. This file is pure presentation.
 * SponsorPage is untouched.
 */

import { useState } from 'react'
import { useXrpl, EXPLORERS } from '../context/XrplContext'
import { useMultisign, MAX_SIGNERS } from '../hooks/useMultisign'
import WalletCard from '../components/WalletCard'
import TxModal from '../components/TxModal'
import TokenSelect from '../components/TokenSelect'
import { amountOf, defaultTokenId, tokenById } from '../lib/tokens'

// ─── Tx-type field sets ───────────────────────────────────────────────────────
// Keeps the tx builder extensible: add a new entry here to support more types.

const TX_TYPES = [
  'Payment',
  'TrustSet',
  'OfferCreate',
  'OfferCancel',
  'AccountSet',
  'EscrowCreate',
  'EscrowFinish',
  'EscrowCancel',
  'NFTokenMint',
  'NFTokenCreateOffer',
  'NFTokenAcceptOffer',
  'NFTokenBurn',
  'MPTokenIssuanceCreate',
  'MPTokenAuthorize',
  'OracleSet',
  'OracleDelete',
  'SignerListSet',
  'SetRegularKey',
]

// ─── small shared helpers ────────────────────────────────────────────────────

function InfoBox({ children }) {
  return (
    <div className="ms-info-box">
      {children}
    </div>
  )
}

function SectionCard({ title, sub, children }) {
  return (
    <div className="glass-card fade-in">
      <div className="section-title">{title}</div>
      {sub && <p className="muted">{sub}</p>}
      {children}
    </div>
  )
}

// ─── SignerList tab ──────────────────────────────────────────────────────────

function SignerListTab() {
  const { wallet, network } = useXrpl()
  const {
    signerEntries, quorum, setQuorum,
    currentList, listLoading, listError, listInfo,
    addSignerEntry, removeSignerEntry, updateSignerEntry,
    fetchSignerList, applySignerList, deleteSignerList,
    totalWeight,
  } = useMultisign()

  const [lookupAddr, setLookupAddr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const q    = parseInt(quorum) || 0
  const valid = q >= 1 && q <= totalWeight && signerEntries.filter(e => e.address.trim()).length >= 1

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open an account on Bank to manage its signer list.</div>}
      {listError && <div className="alert alert-danger">{listError}</div>}
      {listInfo  && <div className="alert alert-success">{listInfo}</div>}

      {/* ── Look up any account ── */}
      <SectionCard title="Look up signer list" sub="Query the current signer list for any account — yours or any other.">
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Account address</label>
            <input type="text"
              placeholder={wallet ? wallet.address + ' (your account)' : 'r…'}
              value={lookupAddr}
              onChange={e => setLookupAddr(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary"
              onClick={() => fetchSignerList(lookupAddr.trim() || wallet?.address)}
              disabled={listLoading}>
              {listLoading ? <span className="spinner"></span> : 'Fetch'}
            </button>
          </div>
        </div>

        {currentList && (
          <div className="ms-current-list fade-in">
            <div className="subsection-label" style={{ marginTop: 12 }}>Current list</div>
            <div className="ms-list-meta">
              <span>Quorum <strong>{currentList.SignerQuorum}</strong></span>
              <span>Signers <strong>{(currentList.SignerEntries ?? []).length}</strong></span>
              {network && currentList.LedgerEntryType && (
                <a href={EXPLORERS[network] + '/accounts/' + (lookupAddr.trim() || wallet?.address)}
                   target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  Explorer ↗
                </a>
              )}
            </div>
            <div className="table-scroll"><table className="data-table" style={{ marginTop: 6 }}>
              <thead>
                <tr><th>#</th><th>Account</th><th>Weight</th></tr>
              </thead>
              <tbody>
                {(currentList.SignerEntries ?? []).map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{i + 1}</td>
                    <td className="address" style={{ fontSize: '0.72rem' }}>{e.SignerEntry.Account}</td>
                    <td>{e.SignerEntry.SignerWeight}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </SectionCard>

      {/* ── Editor ── */}
      <SectionCard
        title="Edit signer list"
        sub="Define up to 8 signers with individual weights. Quorum = minimum total weight required to authorise a transaction.">

        <InfoBox>
          <strong>Weight + quorum model:</strong> each signer has a weight (1–65535).
          A transaction is valid when the combined weight of its collected signatures ≥ quorum.
          Example: 3 signers at weight 1 with quorum 2 means any 2 of the 3 can authorise.
        </InfoBox>

        {/* Signer rows */}
        <div className="ms-signer-grid" style={{ marginTop: 10 }}>
          {signerEntries.map((entry, i) => (
            <div key={i} className="ms-signer-row">
              <div className="ms-signer-index">{i + 1}</div>
              <div className="field" style={{ flex: 3, marginBottom: 0 }}>
                {i === 0 && <label>Address</label>}
                <input
                  type="text"
                  placeholder="r… signer address"
                  value={entry.address}
                  onChange={e => updateSignerEntry(i, 'address', e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                {i === 0 && <label>Weight</label>}
                <input
                  type="number"
                  placeholder="1"
                  value={entry.weight}
                  onChange={e => updateSignerEntry(i, 'weight', e.target.value)}
                  min="1" max="65535"
                />
              </div>
              <div style={{ display: 'flex', alignItems: i === 0 ? 'flex-end' : 'center', paddingBottom: i === 0 ? 0 : 0 }}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => removeSignerEntry(i)}
                  disabled={signerEntries.length <= 2}
                  title={signerEntries.length <= 2 ? 'Minimum 2 signers' : 'Remove signer'}
                >✕</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm"
            onClick={addSignerEntry}
            disabled={signerEntries.length >= MAX_SIGNERS}>
            + Add signer {signerEntries.length >= MAX_SIGNERS ? '(max 8)' : ''}
          </button>
          <span className="muted" style={{ fontSize: '0.7rem' }}>
            Total weight: <strong>{totalWeight}</strong>
          </span>
        </div>

        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Quorum (minimum weight to authorise)</label>
            <input
              type="number"
              placeholder="2"
              value={quorum}
              onChange={e => setQuorum(e.target.value)}
              min="1"
              max={totalWeight || 1}
            />
          </div>
          <div className="field" style={{ flex: 'none', width: 120 }}>
            <label>Threshold</label>
            <div className={`ms-threshold ${q > 0 && q <= totalWeight ? 'ms-threshold-ok' : 'ms-threshold-warn'}`}>
              {q}/{totalWeight}
            </div>
          </div>
        </div>

        {!valid && q > totalWeight && (
          <div className="alert alert-warning" style={{ marginTop: 4 }}>
            Quorum ({q}) exceeds total weight ({totalWeight}). Lower quorum or add more signers.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary"
            onClick={applySignerList}
            disabled={listLoading || !wallet || !valid}>
            {listLoading ? <><span className="spinner"></span> Applying…</> : 'Apply signer list'}
          </button>

          {currentList && !confirmDelete && (
            <button className="btn btn-danger btn-sm"
              onClick={() => setConfirmDelete(true)}>
              Delete list
            </button>
          )}
          {confirmDelete && (
            <>
              <button className="btn btn-danger btn-sm"
                onClick={async () => { await deleteSignerList(); setConfirmDelete(false) }}
                disabled={listLoading}>
                {listLoading ? <span className="spinner"></span> : 'Confirm delete'}
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Security notes">
        <ul className="ms-notes">
          <li>Set quorum to the <strong>minimum trust threshold</strong> for your group. 2-of-3 is common for shared custody.</li>
          <li>The account <strong>on which you install the list</strong> is the one that submits the eventual transactions.</li>
          <li>To disable the master key after installing a signer list, use <strong>AccountSet → asfDisableMaster</strong> on the Issue page.</li>
          <li>Removing a signer list re-enables the master key if it was the only authorization method.</li>
          <li>A signer list requires <strong>2 XRP owner reserve</strong> plus 1 XRP per signer entry (up to 8).</li>
        </ul>
      </SectionCard>
    </div>
  )
}

// ─── Sign & Send tab ─────────────────────────────────────────────────────────

function SignSendTab() {
  const { xrpl, wallet, network } = useXrpl()
  const {
    signerEntries, quorum,
    builtTx, buildError, buildMultisigTx,
    sigSlots, signSlot, clearSlot, updateSigSlot,
    collectedCount, totalSigners, quorumMet,
    submitLoading, submitError, submitResult,
    submitMultisig, resetAll,
  } = useMultisign()

  // ── Transaction builder state ──
  const [txType,    setTxType]    = useState('Payment')
  const [rawFields, setRawFields] = useState('{}')  // JSON for advanced/custom types
  const [useRaw,    setUseRaw]    = useState(false)
  const [building,  setBuilding]  = useState(false)
  const [buildMsg,  setBuildMsg]  = useState('')

  // Common guided fields
  const [dest,       setDest]       = useState('')
  const [amount,     setAmount]     = useState('')
  const [tokenId,    setTokenId]    = useState('XRP')
  const [destTag,    setDestTag]    = useState('')
  const [memo,       setMemo]       = useState('')
  // TrustSet
  const [tsTokenId,  setTsTokenId]  = useState(() => defaultTokenId(network, { allowXrp: false }))
  const [tsLimit,    setTsLimit]    = useState('1000000000')
  // OfferCreate
  const [getsAmt,    setGetsAmt]    = useState('')
  const [getsId,     setGetsId]     = useState('XRP')
  const [paysAmt,    setPaysAmt]    = useState('')
  const [paysId,     setPaysId]     = useState(() => defaultTokenId(network, { allowXrp: false }) || 'XRP')
  // OfferCancel
  const [offerSeq,   setOfferSeq]   = useState('')
  // SetRegularKey
  const [regKey,     setRegKey]     = useState('')
  // AccountSet flags
  const [asfSet,     setAsfSet]     = useState('none')
  const [asfClear,   setAsfClear]   = useState('none')

  const ASF_MAP = {
    asfRequireDestTag: 1, asfRequireAuth: 2, asfDisallowXRP: 3,
    asfDisableMaster: 4, asfAccountTxnID: 5, asfNoFreeze: 6,
    asfGlobalFreeze: 7, asfDefaultRipple: 8, asfDepositAuth: 9,
    asfAllowTrustLineClawback: 16,
  }
  const ASF_OPTS = [
    { value: 'none', label: 'None' },
    ...Object.entries(ASF_MAP).map(([k, v]) => ({ value: k, label: k + ' (' + v + ')' })),
  ]

  /** Assemble txFields from the guided form or raw JSON. */
  const assembleTxFields = () => {
    if (!wallet) return null

    if (useRaw) {
      try {
        const parsed = JSON.parse(rawFields)
        return { ...parsed, Account: wallet.address }
      } catch { return null }
    }

    const base = { TransactionType: txType, Account: wallet.address }

    switch (txType) {
      case 'Payment': {
        if (!dest.trim() || !amount) return null
        const token = tokenById(network, tokenId)
        if (!token) return null
        const amt = amountOf(xrpl, token, amount)
        Object.assign(base, { Destination: dest.trim(), Amount: amt })
        if (destTag) base.DestinationTag = Number(destTag)
        if (memo.trim()) base.Memos = [{ Memo: { MemoData: xrpl.convertStringToHex(memo.trim()) } }]
        break
      }
      case 'TrustSet': {
        const token = tokenById(network, tsTokenId, { allowXrp: false })
        if (!token) return null
        base.LimitAmount = { currency: token.code, issuer: token.issuer, value: tsLimit }
        break
      }
      case 'OfferCreate': {
        if (!getsAmt || !paysAmt) return null
        const gets = tokenById(network, getsId)
        const pays = tokenById(network, paysId)
        if (!gets || !pays) return null
        base.TakerGets = amountOf(xrpl, gets, getsAmt)
        base.TakerPays = amountOf(xrpl, pays, paysAmt)
        break
      }
      case 'OfferCancel': {
        if (!offerSeq) return null
        base.OfferSequence = Number(offerSeq)
        break
      }
      case 'AccountSet': {
        if (asfSet !== 'none')   base.SetFlag   = ASF_MAP[asfSet]
        if (asfClear !== 'none') base.ClearFlag = ASF_MAP[asfClear]
        break
      }
      case 'SetRegularKey': {
        if (regKey.trim()) base.RegularKey = regKey.trim()
        // No RegularKey = delete (remove) the regular key
        break
      }
      default:
        // For remaining types, fall through to raw mode is recommended
        break
    }
    return base
  }

  const handleBuild = async () => {
    if (!wallet) { setBuildMsg('Open an account on Bank first.'); return }
    const fields = assembleTxFields()
    if (!fields) { setBuildMsg('Fill all required fields for this transaction type.'); return }
    setBuilding(true); setBuildMsg('')
    const tx = await buildMultisigTx(fields)
    setBuilding(false)
    if (tx) {
      setBuildMsg(
        'Tx drafted. Fee: ' + (Number(tx.Fee) / 1e6).toFixed(6) +
        ' XRP · Seq: ' + tx.Sequence +
        ' · Signer count: ' + signerEntries.filter(e => e.address.trim()).length
      )
    }
  }

  const [showResult, setShowResult] = useState(false)

  const handleSubmit = async () => {
    const result = await submitMultisig()
    if (result) setShowResult(true)
  }

  // Guided field sets
  const GuidedFields = () => {
    switch (txType) {
      case 'Payment': return (
        <>
          <div className="field">
            <label>Destination</label>
            <input type="text" placeholder="r…" value={dest} onChange={e => setDest(e.target.value)} />
          </div>
          <div className="field-row">
            <TokenSelect network={network} tokenId={tokenId} onChange={token => setTokenId(token.id)} />
            <div className="field">
              <label>Amount</label>
              <input type="number" placeholder="10" min="0" step="any"
                value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Destination tag</label>
              <input type="number" placeholder="Optional" value={destTag}
                onChange={e => setDestTag(e.target.value)} min="0" />
            </div>
            <div className="field">
              <label>Memo</label>
              <input type="text" placeholder="On-chain note" value={memo}
                onChange={e => setMemo(e.target.value)} />
            </div>
          </div>
        </>
      )
      case 'TrustSet': return (
        <>
          <div className="field-row">
            <TokenSelect
              network={network}
              tokenId={tsTokenId}
              allowXrp={false}
              onChange={token => setTsTokenId(token.id)}
            />
            <div className="field">
              <label>Limit</label>
              <input type="number" placeholder="1000000000" value={tsLimit}
                onChange={e => setTsLimit(e.target.value)} min="0" />
            </div>
          </div>
        </>
      )
      case 'OfferCreate': return (
        <>
          <div className="field-row">
            <div className="field">
              <label>You sell — amount</label>
              <input type="number" placeholder="0" value={getsAmt}
                onChange={e => setGetsAmt(e.target.value)} min="0" step="any" />
            </div>
            <TokenSelect network={network} tokenId={getsId} label="You sell" onChange={token => setGetsId(token.id)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>You buy — amount</label>
              <input type="number" placeholder="0" value={paysAmt}
                onChange={e => setPaysAmt(e.target.value)} min="0" step="any" />
            </div>
            <TokenSelect network={network} tokenId={paysId} label="You buy" onChange={token => setPaysId(token.id)} />
          </div>
        </>
      )
      case 'OfferCancel': return (
        <div className="field">
          <label>Offer sequence number</label>
          <input type="number" placeholder="12345" value={offerSeq}
            onChange={e => setOfferSeq(e.target.value)} min="0" />
        </div>
      )
      case 'AccountSet': return (
        <>
          <div className="field">
            <label>Set flag</label>
            <select value={asfSet} onChange={e => setAsfSet(e.target.value)}>
              {ASF_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Clear flag</label>
            <select value={asfClear} onChange={e => setAsfClear(e.target.value)}>
              {ASF_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </>
      )
      case 'SetRegularKey': return (
        <div className="field">
          <label>Regular key address (leave blank to delete)</label>
          <input type="text" placeholder="r… or blank to remove" value={regKey}
            onChange={e => setRegKey(e.target.value)} />
        </div>
      )
      default: return (
        <div className="alert alert-info" style={{ marginTop: 0 }}>
          Use <strong>Raw JSON mode</strong> for {txType} — toggle the switch above.
        </div>
      )
    }
  }

  const readyCount  = sigSlots.filter(s => s.blob).length
  const signerCount = signerEntries.filter(e => e.address.trim()).length

  return (
    <div className="flow">
      {!wallet && <div className="alert alert-warning">Open an account on Bank first.</div>}
      {(buildError || buildMsg) && (
        <div className={'alert ' + (buildError ? 'alert-danger' : 'alert-info')}>
          {buildError || buildMsg}
        </div>
      )}

      {/* ── 1. Build ── */}
      <SectionCard
        title="1 · Build transaction"
        sub="Select a type, fill the fields, then draft. Fee and sequence are auto-filled; the fee is scaled up for multi-sig.">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 160 }}>
            <label>Transaction type</label>
            <select value={txType} onChange={e => { setTxType(e.target.value); setUseRaw(false) }}>
              {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <label className="flag-row" style={{ marginBottom: 0, flex: 'none' }}>
            <input type="checkbox" checked={useRaw} onChange={e => setUseRaw(e.target.checked)} />
            <span className="flag-label">Raw JSON mode</span>
          </label>
        </div>

        {useRaw ? (
          <div className="field">
            <label>Transaction JSON (Account is filled automatically — omit it)</label>
            <textarea rows={8} value={rawFields} onChange={e => setRawFields(e.target.value)}
              className="mono" placeholder={'{\n  "TransactionType": "Payment",\n  "Destination": "r…",\n  "Amount": "1000000"\n}'} />
          </div>
        ) : (
          <GuidedFields />
        )}

        <button className="btn btn-primary" onClick={handleBuild}
          disabled={building || !wallet}>
          {building ? <><span className="spinner"></span> Drafting…</> : 'Draft transaction'}
        </button>

        {builtTx && (
          <div style={{ marginTop: 10 }}>
            <div className="subsection-label">Drafted transaction</div>
            <div className="ms-tx-summary">
              <span><span className="muted">Type</span> {builtTx.TransactionType}</span>
              <span><span className="muted">Fee</span> <span className="mono">{(Number(builtTx.Fee) / 1e6).toFixed(6)} XRP</span></span>
              <span><span className="muted">Seq</span> <span className="mono">{builtTx.Sequence}</span></span>
              <span><span className="muted">Last ledger</span> <span className="mono">{builtTx.LastLedgerSequence}</span></span>
            </div>
            <details className="ms-tx-details">
              <summary>Full JSON</summary>
              <pre className="result-box" style={{ marginTop: 6 }}>{JSON.stringify(builtTx, null, 2)}</pre>
            </details>
          </div>
        )}
      </SectionCard>

      {/* ── 2. Collect signatures ── */}
      <SectionCard
        title="2 · Collect signatures"
        sub={`Each authorised signer enters their seed and signs independently. You need at least quorum ${quorum} weight of signatures before broadcasting.`}>

        {!builtTx && (
          <div className="alert alert-info">Draft a transaction above first.</div>
        )}

        {builtTx && (
          <>
            <div className="ms-sig-progress">
              <div className="ms-sig-progress-bar" style={{ width: Math.min(100, (readyCount / Math.max(signerCount, 1)) * 100) + '%' }} />
            </div>
            <div className="ms-sig-count">
              {readyCount} of {signerCount} signed
              {quorumMet
                ? <span className="badge badge-connected" style={{ marginLeft: 8 }}>Quorum met ✓</span>
                : <span className="badge badge-testnet"   style={{ marginLeft: 8 }}>Need quorum {quorum}</span>}
            </div>

            <div className="ms-signer-grid" style={{ marginTop: 10 }}>
              {sigSlots.map((slot, i) => {
                const label = signerEntries[i]?.address
                  ? signerEntries[i].address.slice(0, 8) + '…' + signerEntries[i].address.slice(-4)
                  : 'Signer ' + (i + 1)
                return (
                  <div key={i} className={'ms-sig-slot' + (slot.blob ? ' ms-sig-slot-done' : '')}>
                    <div className="ms-sig-slot-header">
                      <span className="ms-signer-index">{i + 1}</span>
                      <span className="ms-sig-label">{label}</span>
                      {slot.blob
                        ? <span className="badge badge-connected">Signed ✓</span>
                        : <span className="badge badge-testnet">Pending</span>}
                    </div>

                    {slot.error && (
                      <div className="alert alert-danger" style={{ marginTop: 6, padding: '4px 8px' }}>
                        {slot.error}
                      </div>
                    )}

                    {!slot.blob ? (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <input
                          type="password"
                          placeholder="sEdT… seed"
                          value={slot.seed}
                          onChange={e => updateSigSlot(i, 'seed', e.target.value)}
                          style={{ flex: 1, background: 'rgba(255,247,237,.04)',
                            border: '1px solid var(--border)', borderRadius: 'var(--r1)',
                            color: 'var(--txt)', fontFamily: 'inherit',
                            fontSize: '0.84rem', padding: '7px 10px' }}
                        />
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => signSlot(i)}
                          disabled={slot.signing || !slot.seed.trim()}>
                          {slot.signing ? <span className="spinner"></span> : 'Sign'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <code style={{ flex: 1, fontSize: '0.62rem', color: 'var(--teal)',
                          wordBreak: 'break-all', lineHeight: 1.4 }}>
                          {slot.blob.slice(0, 24)}…{slot.blob.slice(-12)}
                        </code>
                        <button className="btn btn-secondary btn-sm" onClick={() => clearSlot(i)}
                          title="Re-sign this slot">↺</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </SectionCard>

      {/* ── 3. Broadcast ── */}
      <SectionCard
        title="3 · Broadcast"
        sub="Combines all collected signatures via multisign() and submits the transaction.">

        {submitError && <div className="alert alert-danger">{submitError}</div>}

        <div className="ms-broadcast-meta">
          <div>
            <span className="muted">Signatures ready</span>
            <strong>{readyCount}</strong>
          </div>
          <div>
            <span className="muted">Quorum</span>
            <strong>{quorum}</strong>
          </div>
          <div>
            <span className="muted">Status</span>
            <span className={quorumMet ? 'ms-status-ok' : 'ms-status-wait'}>
              {quorumMet ? 'Ready to send' : 'Collecting…'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitLoading || !quorumMet || !builtTx}>
            {submitLoading
              ? <><span className="spinner"></span> Broadcasting…</>
              : 'Broadcast now'}
          </button>
          <button className="btn btn-secondary" onClick={resetAll}
            disabled={submitLoading}>
            Reset
          </button>
        </div>

        {showResult && submitResult && (
          <TxModal tx={submitResult} onClose={() => setShowResult(false)} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Page shell ──────────────────────────────────────────────────────────────

const PAGE_TABS = [
  { key: 'list', label: 'Signer List' },
  { key: 'sign', label: 'Sign & Send' },
]

export default function MultisignPage() {
  const [tab, setTab] = useState('list')

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Multi-sign</div>
        <h2>Shared control. On-chain trust.</h2>
        <p>
          Install a signer list, then build and co-sign any XRPL transaction with up to 8 independent parties —
          no single key holds all the power.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '4px 8px', marginBottom: 10 }}>
        <div className="tab-bar">
          {PAGE_TABS.map(t => (
            <button key={t.key}
              className={'tab-btn' + (tab === t.key ? ' tab-btn-active' : '')}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div>
          {tab === 'list' && <SignerListTab />}
          {tab === 'sign' && <SignSendTab />}
        </div>
        <div className="flow">
          <WalletCard />

          <div className="glass-card">
            <div className="section-title">How multi-sign works</div>
            <p className="muted" style={{ marginBottom: 8 }}>
              XRPL multi-sig uses a <strong>SignerList object</strong> stored on-chain. Each signer
              has a <em>weight</em>; a transaction is valid when the sum of signing weights meets or
              exceeds the <em>quorum</em>.
            </p>
            <p className="muted" style={{ marginBottom: 8 }}>
              Each signer signs the <em>same</em> unsigned transaction blob locally — seeds never
              leave the browser. The signed blobs are combined with <code>multisign()</code> into
              one final blob that is submitted to the ledger once.
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              Multi-sig transactions require a higher fee:
              <code> base_fee × (1 + signer_count)</code>. This is calculated automatically.
            </p>
          </div>

          <div className="glass-card">
            <div className="section-title">Common patterns</div>
            <ul className="ms-notes">
              <li><strong>2-of-3 shared custody</strong> — quorum 2, three signers weight 1 each.</li>
              <li><strong>Board approval</strong> — quorum 3, five signers weight 1 each.</li>
              <li><strong>Weighted veto</strong> — CEO weight 2, board members weight 1 each, quorum 3.</li>
              <li><strong>Fee sponsorship</strong> — use the Sponsor tab for the dedicated 2-party sponsorship flow.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
