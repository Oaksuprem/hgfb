/**
 * ActivatePage — bring any XRPL address live on any network.
 *
 * Three tools in one place:
 *   1. Generate   — create a fresh keypair (client-side, nothing sent)
 *   2. Fund       — sponsor sends ≥ base reserve to activate the address
 *   3. Check      — verify whether an address is already active on-chain
 *
 * The activation Payment is a standard single-sig transaction from the
 * sponsor's (currently loaded) wallet.  No multisig or tickets required.
 */

import { useState, useCallback } from 'react'
import { useXrpl, EXPLORERS } from '../context/XrplContext'
import TxModal from '../components/TxModal'
import WalletCard from '../components/WalletCard'

// Base reserve on each network (in XRP).
// The actual value is enforced by the ledger — these are informational.
const BASE_RESERVE = {
  mainnet: 2,
  testnet: 2,
  devnet:  2,
}

// ─── tiny copy helper ────────────────────────────────────────────────────────
function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch (_) {}
  }
  return (
    <button className="btn btn-secondary btn-sm" onClick={copy} style={{ flexShrink: 0 }}>
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ActivatePage() {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()

  const reserve = BASE_RESERVE[network] ?? 2

  // ── tab ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('fund')

  // ── Generate tab state ───────────────────────────────────────────────────
  const [generated, setGenerated] = useState(null)   // { address, seed, publicKey }
  const [showSeed,  setShowSeed]  = useState(false)

  const generateWallet = () => {
    const w = xrpl.Wallet.generate()
    setGenerated({ address: w.address, seed: w.seed, publicKey: w.publicKey })
    setShowSeed(false)
  }

  const clearGenerated = () => {
    setGenerated(null)
    setShowSeed(false)
  }

  // ── Fund tab state ───────────────────────────────────────────────────────
  const [destAddr,   setDestAddr]   = useState('')
  const [fundAmount, setFundAmount] = useState(String(reserve))
  const [funding,    setFunding]    = useState(false)
  const [fundError,  setFundError]  = useState('')
  const [txResult,   setTxResult]   = useState(null)

  const activate = async () => {
    const dest = destAddr.trim()
    if (!wallet)        { setFundError('Open your book on Bank first.'); return }
    if (!dest)          { setFundError('Destination address is required.'); return }
    if (!xrpl.isValidAddress(dest)) { setFundError('Not a valid XRPL address.'); return }
    if (dest === wallet.address)    { setFundError('You can't fund your own address.'); return }
    const amt = parseFloat(fundAmount)
    if (!amt || amt < reserve) {
      setFundError(`Minimum is ${reserve} XRP to meet the base reserve on ${network}.`)
      return
    }

    setFunding(true); setFundError(''); setTxResult(null)
    try {
      const c  = await ensureConnected()
      const w  = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'Payment',
        Account:         wallet.address,
        Destination:     dest,
        Amount:          xrpl.xrpToDrops(fundAmount),
      }, { wallet: w })

      setTxResult(result)
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({
        type:   'Activate Account',
        status: ok ? 'success' : 'error',
        hash:   result.result.hash,
      })
      if (ok) setDestAddr('')
    } catch (e) {
      setFundError('Payment failed: ' + e.message)
    } finally {
      setFunding(false)
    }
  }

  // ── useDestFromGenerated — wire "Fund this address" button ───────────────
  const useGenerated = () => {
    if (!generated) return
    setDestAddr(generated.address)
    setTab('fund')
  }

  // ── Check tab state ──────────────────────────────────────────────────────
  const [checkAddr,    setCheckAddr]    = useState('')
  const [checking,     setChecking]     = useState(false)
  const [checkResult,  setCheckResult]  = useState(null)   // null | { found, balance?, seq? }
  const [checkError,   setCheckError]   = useState('')

  const checkAccount = useCallback(async () => {
    const addr = checkAddr.trim()
    if (!addr)                         { setCheckError('Enter an address.'); return }
    if (!xrpl.isValidAddress(addr))    { setCheckError('Not a valid XRPL address.'); return }

    setChecking(true); setCheckError(''); setCheckResult(null)
    try {
      const c = await ensureConnected()
      const r = await c.request({ command: 'account_info', account: addr, ledger_index: 'validated' })
      const info = r.result.account_data
      setCheckResult({
        found:   true,
        balance: xrpl.dropsToXrp(info.Balance),
        seq:     info.Sequence,
        flags:   info.Flags,
      })
    } catch (e) {
      if (e.data?.error === 'actNotFound' || e.message?.includes('actNotFound')) {
        setCheckResult({ found: false })
      } else {
        setCheckError('Lookup failed: ' + e.message)
      }
    } finally {
      setChecking(false)
    }
  }, [checkAddr, xrpl, ensureConnected])

  const explorer = EXPLORERS[network]

  const TABS = [
    { key: 'fund',     label: 'Fund address'   },
    { key: 'generate', label: 'Generate wallet' },
    { key: 'check',    label: 'Check status'   },
  ]

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Activate</div>
        <h2>Bring accounts live.</h2>
        <p>
          An XRPL address doesn't exist on-chain until it receives the base reserve ({reserve} XRP on {network}).
          Generate a fresh wallet, fund it from your book, or verify any address.
        </p>
      </div>

      {/* tab bar */}
      <div className="glass-card" style={{ padding: '4px 8px', marginBottom: 12 }}>
        <div className="tab-bar">
          {TABS.map(t => (
            <button
              key={t.key}
              className={'tab-btn' + (tab === t.key ? ' tab-btn-active' : '')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* ── left column ────────────────────────────────────────────────── */}
        <div className="flow">

          {/* ── Fund tab ─────────────────────────────────────────────────── */}
          {tab === 'fund' && (
            <div className="glass-card fade-in">
              <div className="section-title">Fund &amp; activate</div>
              <p className="muted">
                Send XRP from your loaded wallet to bring a new address live.
                The minimum is {reserve} XRP — this covers the base account reserve which the ledger requires before an account can transact.
              </p>

              {!wallet && (
                <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                  Open your sponsor wallet on Bank first.
                </div>
              )}

              {network === 'mainnet' && (
                <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                  You are on <strong>Mainnet</strong>. This sends real XRP.
                </div>
              )}

              {fundError && (
                <div className="alert alert-danger" style={{ marginBottom: 12 }}>{fundError}</div>
              )}

              <div className="field">
                <label>New address to activate</label>
                <input
                  type="text"
                  placeholder="r…"
                  value={destAddr}
                  onChange={e => { setDestAddr(e.target.value); setFundError('') }}
                  className="mono"
                />
              </div>

              <div className="field">
                <label>Amount (XRP) — min {reserve} XRP</label>
                <input
                  type="number"
                  placeholder={String(reserve)}
                  value={fundAmount}
                  onChange={e => setFundAmount(e.target.value)}
                  min={reserve}
                  step="0.000001"
                />
              </div>

              {/* reserve breakdown */}
              <div className="glass-card" style={{
                background: 'rgba(232,168,86,.04)',
                border: '1px solid rgba(232,168,86,.14)',
                marginBottom: 14,
                padding: '10px 12px',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Reserve breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    ['Base account reserve', `${reserve} XRP`],
                    ['Each trust line', '+ 0.2 XRP'],
                    ['Each open offer', '+ 0.2 XRP'],
                    ['Each NFT page', '+ 0.2 XRP'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.74rem' }}>
                      <span style={{ color: 'var(--txt2)' }}>{label}</span>
                      <span className="mono" style={{ color: 'var(--txt)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={activate}
                disabled={funding || !wallet}
              >
                {funding
                  ? <><span className="spinner"></span> Activating…</>
                  : `Send ${fundAmount || reserve} XRP → activate`}
              </button>
            </div>
          )}

          {/* ── Generate tab ──────────────────────────────────────────────── */}
          {tab === 'generate' && (
            <div className="glass-card fade-in">
              <div className="section-title">Generate new wallet</div>
              <p className="muted">
                Creates a fresh keypair entirely in your browser — nothing is sent to any server.
                The address won't exist on-chain until it receives the base reserve.
              </p>

              {!generated ? (
                <button className="btn btn-primary btn-full" onClick={generateWallet}>
                  Generate keypair
                </button>
              ) : (
                <div className="flow">
                  <div className="alert alert-warning">
                    Save the seed now. It will not be shown again after you leave this page.
                  </div>

                  <div className="field">
                    <label>Address</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        readOnly
                        value={generated.address}
                        className="mono address"
                        style={{ background: 'rgba(232,168,86,.06)' }}
                      />
                      <CopyBtn value={generated.address} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Seed (secret — keep private)</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type={showSeed ? 'text' : 'password'}
                        readOnly
                        value={generated.seed}
                        className="mono"
                        style={{ background: 'rgba(251,113,133,.06)' }}
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowSeed(v => !v)}
                        style={{ flexShrink: 0 }}
                      >
                        {showSeed ? 'Hide' : 'Show'}
                      </button>
                      <CopyBtn value={generated.seed} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Public key</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        readOnly
                        value={generated.publicKey}
                        className="mono"
                        style={{ fontSize: '.68rem', background: 'rgba(255,247,237,.03)' }}
                      />
                      <CopyBtn value={generated.publicKey} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={useGenerated}>
                      Fund this address →
                    </button>
                    <button className="btn btn-secondary" onClick={generateWallet}>
                      New keypair
                    </button>
                    <button className="btn btn-secondary" onClick={clearGenerated}>
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Check tab ─────────────────────────────────────────────────── */}
          {tab === 'check' && (
            <div className="glass-card fade-in">
              <div className="section-title">Check account status</div>
              <p className="muted">
                Query the ledger to see whether an address is active. Inactive addresses have no entry
                in the ledger state — they simply don't exist yet.
              </p>

              {checkError && (
                <div className="alert alert-danger" style={{ marginBottom: 12 }}>{checkError}</div>
              )}

              <div className="field">
                <label>Address to check</label>
                <input
                  type="text"
                  placeholder="r…"
                  value={checkAddr}
                  onChange={e => { setCheckAddr(e.target.value); setCheckResult(null); setCheckError('') }}
                  className="mono"
                  onKeyDown={e => e.key === 'Enter' && checkAccount()}
                />
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={checkAccount}
                disabled={checking}
                style={{ marginBottom: checkResult ? 14 : 0 }}
              >
                {checking ? <><span className="spinner"></span> Checking…</> : 'Check'}
              </button>

              {checkResult && (
                <div className={`alert ${checkResult.found ? 'alert-success' : 'alert-danger'} fade-in`}
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {checkResult.found ? '✓ Account is active on ' + network : '✗ Account not found on ' + network}
                  </div>

                  {checkResult.found && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[
                        ['Balance', checkResult.balance + ' XRP'],
                        ['Sequence', String(checkResult.seq)],
                        ['Flags', '0x' + checkResult.flags?.toString(16).padStart(8, '0')],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.74rem' }}>
                          <span style={{ opacity: .75 }}>{k}</span>
                          <span className="mono">{v}</span>
                        </div>
                      ))}
                      <a
                        href={`${explorer}/accounts/${checkAddr.trim()}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '.72rem', color: 'var(--accent)', marginTop: 4 }}
                      >
                        View on explorer ↗
                      </a>
                    </div>
                  )}

                  {!checkResult.found && (
                    <div style={{ fontSize: '.74rem', opacity: .8 }}>
                      Send at least {reserve} XRP to this address to activate it.
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setDestAddr(checkAddr.trim()); setTab('fund') }}
                        style={{ marginLeft: 8 }}
                      >
                        Fund it →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── right column ───────────────────────────────────────────────── */}
        <div className="flow">
          <WalletCard />

          <div className="glass-card">
            <div className="section-title">How activation works</div>
            <p className="muted" style={{ marginBottom: 8 }}>
              The XRP Ledger has no "create account" transaction. An account comes into existence
              the moment any funded address sends it enough XRP to meet the <strong>base reserve</strong>.
            </p>
            <p className="muted" style={{ marginBottom: 8 }}>
              That first Payment is the activation. The ledger creates the AccountRoot object, sets
              the sequence to 1, and the address is now live — ready to sign transactions, open
              trust lines, and hold assets.
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              The base reserve is currently <strong>{reserve} XRP</strong> on {network}. It is held
              by the ledger as long as the account exists; you can recover it by deleting the account
              once it's empty.
            </p>
          </div>
        </div>
      </div>

      {txResult && (
        <TxModal tx={txResult} onClose={() => setTxResult(null)} />
      )}
    </div>
  )
}
