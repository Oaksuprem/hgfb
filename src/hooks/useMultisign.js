/**
 * useMultisign
 *
 * Encapsulates all XRPL multi-signature logic:
 *   - SignerList management (fetch current, set new, delete)
 *   - Building multi-sig ready transactions (SigningPubKey = "")
 *   - Collecting N independent signatures from seeds or blobs
 *   - Combining with xrpl.multisign() and submitting
 *
 * Designed to be consumed by MultisignPage.
 * SponsorPage keeps its own inline flow and is unaffected.
 *
 * Supports up to 8 signers (XRPL protocol maximum).
 */

import { useState, useCallback } from 'react'
import { useXrpl } from '../context/XrplContext'

export const MAX_SIGNERS  = 8
export const MIN_QUORUM   = 1

// ─── helpers ────────────────────────────────────────────────────────────────

/** Parse a seed string into a Wallet, or return null on failure. */
function seedToWallet(xrpl, seed) {
  const s = (seed || '').trim()
  if (!s) return null
  try { return xrpl.Wallet.fromSeed(s) } catch { return null }
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useMultisign() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  // ── Signer list state ────────────────────────────────────────────────────
  // Each entry: { address, weight }  — edited in the UI, validated before submit
  const [signerEntries, setSignerEntries] = useState([
    { address: '', weight: '1' },
    { address: '', weight: '1' },
  ])
  const [quorum,        setQuorum]        = useState('2')
  const [currentList,   setCurrentList]   = useState(null)  // fetched from ledger
  const [listLoading,   setListLoading]   = useState(false)
  const [listError,     setListError]     = useState('')
  const [listInfo,      setListInfo]      = useState('')

  // ── Transaction build state ───────────────────────────────────────────────
  const [builtTx,   setBuiltTx]   = useState(null)
  const [buildError, setBuildError] = useState('')

  // ── Signatures state ─────────────────────────────────────────────────────
  // Each entry: { seed, blob, signing, error }
  const [sigSlots,   setSigSlots]   = useState([
    { seed: '', blob: '', signing: false, error: '' },
    { seed: '', blob: '', signing: false, error: '' },
  ])

  // ── Submit state ─────────────────────────────────────────────────────────
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError,   setSubmitError]   = useState('')
  const [submitResult,  setSubmitResult]  = useState(null)

  // ────────────────────────────────────────────────────────────────────────
  // Signer list helpers
  // ────────────────────────────────────────────────────────────────────────

  const addSignerEntry = useCallback(() => {
    setSignerEntries(prev => {
      if (prev.length >= MAX_SIGNERS) return prev
      return [...prev, { address: '', weight: '1' }]
    })
    setSigSlots(prev => {
      if (prev.length >= MAX_SIGNERS) return prev
      return [...prev, { seed: '', blob: '', signing: false, error: '' }]
    })
  }, [])

  const removeSignerEntry = useCallback((i) => {
    setSignerEntries(prev => prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i))
    setSigSlots(prev => prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i))
  }, [])

  const updateSignerEntry = useCallback((i, field, val) => {
    setSignerEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }, [])

  /** Sync sigSlot count to match signerEntries length (called after loading from ledger). */
  const syncSigSlots = useCallback((count) => {
    setSigSlots(prev => {
      const next = [...prev]
      while (next.length < count)  next.push({ seed: '', blob: '', signing: false, error: '' })
      while (next.length > count)  next.pop()
      return next
    })
  }, [])

  // ────────────────────────────────────────────────────────────────────────
  // Ledger operations: fetch, set, delete signer list
  // ────────────────────────────────────────────────────────────────────────

  /** Fetch the current SignerList object from the ledger for the active wallet. */
  const fetchSignerList = useCallback(async (targetAddress) => {
    const addr = targetAddress || wallet?.address
    if (!addr) { setListError('No account address available.'); return }
    setListLoading(true); setListError(''); setListInfo(''); setCurrentList(null)
    try {
      const c = await ensureConnected()
      const r = await c.request({
        command: 'account_objects',
        account: addr,
        type: 'signer_list',
        ledger_index: 'validated',
      })
      const lists = r.result.account_objects ?? []
      if (lists.length === 0) {
        setCurrentList(null)
        setListInfo('No signer list on this account.')
      } else {
        const list = lists[0]
        setCurrentList(list)
        // Pre-populate the editor with the fetched values
        const entries = (list.SignerEntries ?? []).map(e => ({
          address: e.SignerEntry.Account,
          weight:  String(e.SignerEntry.SignerWeight),
        }))
        setSignerEntries(entries)
        setQuorum(String(list.SignerQuorum))
        syncSigSlots(entries.length)
        setListInfo('Signer list loaded from ledger.')
      }
    } catch (e) { setListError('Fetch failed: ' + e.message) }
    finally { setListLoading(false) }
  }, [wallet, ensureConnected, syncSigSlots])

  /** Submit SignerListSet — creates or replaces the signer list. */
  const applySignerList = useCallback(async () => {
    if (!wallet) { setListError('Open an account on Bank first.'); return }

    const q = parseInt(quorum)
    if (isNaN(q) || q < MIN_QUORUM) { setListError('Quorum must be at least 1.'); return }

    const validEntries = signerEntries.filter(e => e.address.trim())
    if (validEntries.length < 1) { setListError('At least one signer address required.'); return }
    if (validEntries.length > MAX_SIGNERS) { setListError('Maximum 8 signers allowed.'); return }

    for (const e of validEntries) {
      if (!xrpl.isValidAddress(e.address.trim())) {
        setListError('Invalid address: ' + e.address); return
      }
      const w = parseInt(e.weight)
      if (isNaN(w) || w < 1 || w > 65535) {
        setListError('Weight must be 1–65535 for: ' + e.address); return
      }
    }

    const totalWeight = validEntries.reduce((s, e) => s + parseInt(e.weight), 0)
    if (q > totalWeight) {
      setListError('Quorum (' + q + ') exceeds total signer weight (' + totalWeight + ').')
      return
    }

    setListLoading(true); setListError(''); setListInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const result = await c.submitAndWait({
        TransactionType: 'SignerListSet',
        Account: wallet.address,
        SignerQuorum: q,
        SignerEntries: validEntries.map(e => ({
          SignerEntry: {
            Account:      e.address.trim(),
            SignerWeight: parseInt(e.weight),
          },
        })),
      }, { wallet: w })

      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'SignerListSet', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) {
        setListInfo('Signer list applied. Quorum: ' + q + '/' + totalWeight + '.')
        await fetchSignerList(wallet.address)
      } else {
        setListError('SignerListSet failed: ' + result.result.meta.TransactionResult)
      }
      return result
    } catch (e) { setListError('Apply failed: ' + e.message) }
    finally { setListLoading(false) }
  }, [wallet, quorum, signerEntries, xrpl, ensureConnected, addTx, fetchSignerList])

  /** Delete the signer list (SignerListSet with no SignerEntries + quorum 0). */
  const deleteSignerList = useCallback(async () => {
    if (!wallet) { setListError('Open an account on Bank first.'); return }
    setListLoading(true); setListError(''); setListInfo('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      // XRPL: delete = SignerListSet with SignerQuorum:0 and no SignerEntries
      const result = await c.submitAndWait({
        TransactionType: 'SignerListSet',
        Account: wallet.address,
        SignerQuorum: 0,
      }, { wallet: w })
      const ok = result.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({ type: 'SignerListSet (Delete)', status: ok ? 'success' : 'error', hash: result.result.hash })
      if (ok) {
        setCurrentList(null)
        setListInfo('Signer list removed.')
      } else {
        setListError('Delete failed: ' + result.result.meta.TransactionResult)
      }
      return result
    } catch (e) { setListError('Delete failed: ' + e.message) }
    finally { setListLoading(false) }
  }, [wallet, xrpl, ensureConnected, addTx])

  // ────────────────────────────────────────────────────────────────────────
  // Transaction building
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Build a multi-sig ready transaction.
   * @param {object} txFields — complete transaction fields (TransactionType, Account, etc.)
   *   Do NOT include Fee, Sequence, LastLedgerSequence, or SigningPubKey — these are filled here.
   * @returns {object} filled transaction with SigningPubKey=""
   */
  const buildMultisigTx = useCallback(async (txFields) => {
    setBuildError('')
    setBuiltTx(null)
    try {
      const c = await ensureConnected()
      const base = {
        ...txFields,
        SigningPubKey: '',  // empty = multi-sig marker
      }
      const filled = await c.autofill(base)
      filled.SigningPubKey = '' // autofill may overwrite; force it back
      // Fee for multi-sig scales with signer count: base_fee * (1 + signer_count)
      // autofill computes the base; we bump it by (signer_count - 1) signers extra
      // to guarantee ledger acceptance when all signers submit.
      const signerCount = signerEntries.filter(e => e.address.trim()).length
      if (signerCount > 1) {
        const baseFee = parseInt(filled.Fee || '12')
        filled.Fee = String(baseFee * (1 + signerCount))
      }
      setBuiltTx(filled)
      return filled
    } catch (e) {
      setBuildError('Build failed: ' + e.message)
      return null
    }
  }, [ensureConnected, signerEntries])

  // ────────────────────────────────────────────────────────────────────────
  // Signature collection
  // ────────────────────────────────────────────────────────────────────────

  const updateSigSlot = useCallback((i, field, val) => {
    setSigSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  }, [])

  /**
   * Sign the built transaction with the seed at slot i.
   * Uses xrpl.js multi-sign mode (second arg to wallet.sign = true).
   */
  const signSlot = useCallback(async (i) => {
    if (!builtTx) return
    const slot = sigSlots[i]
    if (!slot?.seed?.trim()) {
      updateSigSlot(i, 'error', 'Seed required.')
      return
    }
    const w = seedToWallet(xrpl, slot.seed)
    if (!w) {
      updateSigSlot(i, 'error', 'Invalid seed.')
      return
    }
    updateSigSlot(i, 'signing', true)
    updateSigSlot(i, 'error', '')
    try {
      const signed = w.sign(builtTx, true) // true = multi-sign mode
      updateSigSlot(i, 'blob', signed.tx_blob)
      updateSigSlot(i, 'error', '')
    } catch (e) {
      updateSigSlot(i, 'error', 'Sign failed: ' + e.message)
    } finally {
      updateSigSlot(i, 'signing', false)
    }
  }, [builtTx, sigSlots, xrpl, updateSigSlot])

  /** Clear a previously collected signature so the slot can be re-signed. */
  const clearSlot = useCallback((i) => {
    updateSigSlot(i, 'blob', '')
    updateSigSlot(i, 'error', '')
  }, [updateSigSlot])

  // ────────────────────────────────────────────────────────────────────────
  // Combine + submit
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Combine all collected blobs via xrpl.multisign() and submit to the ledger.
   * Returns the submitAndWait result.
   */
  const submitMultisig = useCallback(async () => {
    const readyBlobs = sigSlots.map(s => s.blob).filter(Boolean)
    if (readyBlobs.length === 0) {
      setSubmitError('No signatures collected yet.')
      return null
    }
    setSubmitLoading(true); setSubmitError(''); setSubmitResult(null)
    try {
      const c        = await ensureConnected()
      const combined = xrpl.multisign(readyBlobs)
      const result   = await c.submitAndWait(combined)
      setSubmitResult(result)
      addTx({
        type: 'Multisig ' + (builtTx?.TransactionType ?? 'Tx'),
        status: result.result.meta.TransactionResult === 'tesSUCCESS' ? 'success' : 'error',
        hash: result.result.hash,
      })
      return result
    } catch (e) {
      setSubmitError('Submit failed: ' + e.message)
      return null
    } finally {
      setSubmitLoading(false)
    }
  }, [sigSlots, xrpl, ensureConnected, addTx, builtTx])

  // ────────────────────────────────────────────────────────────────────────
  // Reset
  // ────────────────────────────────────────────────────────────────────────

  const resetSignatures = useCallback(() => {
    setSigSlots(prev => prev.map(s => ({ ...s, blob: '', error: '' })))
    setSubmitResult(null)
    setSubmitError('')
  }, [])

  const resetAll = useCallback(() => {
    setBuiltTx(null)
    setBuildError('')
    setSubmitResult(null)
    setSubmitError('')
    setSigSlots(prev => prev.map(() => ({ seed: '', blob: '', signing: false, error: '' })))
  }, [])

  // ────────────────────────────────────────────────────────────────────────
  // Derived values
  // ────────────────────────────────────────────────────────────────────────

  const collectedCount  = sigSlots.filter(s => s.blob).length
  const totalSigners    = signerEntries.filter(e => e.address.trim()).length
  const quorumMet       = collectedCount >= parseInt(quorum || '0')
  const totalWeight     = signerEntries.reduce((s, e) => s + (parseInt(e.weight) || 0), 0)

  return {
    // signer list
    signerEntries, setSignerEntries,
    quorum, setQuorum,
    currentList,
    listLoading, listError, listInfo,
    addSignerEntry, removeSignerEntry, updateSignerEntry,
    fetchSignerList, applySignerList, deleteSignerList,
    totalWeight,

    // build
    builtTx, buildError,
    buildMultisigTx,

    // signatures
    sigSlots,
    signSlot, clearSlot, updateSigSlot,
    collectedCount, totalSigners, quorumMet,

    // submit
    submitLoading, submitError, submitResult,
    submitMultisig,

    // misc
    resetSignatures, resetAll,
    seedToWallet: (seed) => seedToWallet(xrpl, seed),
  }
}
