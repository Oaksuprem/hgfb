import { useState, useCallback } from 'react'
import { useXrpl } from '../../context/XrplContext'
import { createTickets, buildBatchTransaction, submitBatch as batchSubmit } from '../../utils/batch'

/**
 * Hook for ticket-based batch transaction workflows.
 *
 * Workflow:
 *   1. createTicketBatch(count)   — creates XRPL tickets, stores sequences
 *   2. buildBatch(txFieldsArray)  — autofills each tx with a ticket sequence
 *   3. submitBatch()              — submits all txns in parallel
 *   4. reset()                    — clears all state
 */
export function useTxBatch() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()

  // Ticket phase
  const [tickets,      setTickets]      = useState([])
  const [ticketLoading,setTicketLoading]= useState(false)
  const [ticketError,  setTicketError]  = useState('')

  // Build phase
  const [builtBatch,   setBuiltBatch]   = useState([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError,   setBatchError]   = useState('')

  // Submit phase
  const [results,       setResults]       = useState([])
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError,   setSubmitError]   = useState('')

  // ── Create tickets ──────────────────────────────────────────────────────
  const createTicketBatch = useCallback(async (count) => {
    if (count < 2 || count > 250) {
      setTicketError('Ticket count must be 2–250')
      return null
    }
    setTicketLoading(true)
    setTicketError('')
    try {
      const client = await ensureConnected()
      const w      = xrpl.Wallet.fromSeed(wallet.seed)
      const seqs   = await createTickets(wallet.address, count, client, w)
      setTickets(seqs)
      return seqs
    } catch (e) {
      setTicketError(e.message)
      return null
    } finally {
      setTicketLoading(false)
    }
  }, [wallet, ensureConnected, xrpl])

  // ── Build batch ─────────────────────────────────────────────────────────
  const buildBatch = useCallback(async (txFieldsArray) => {
    if (txFieldsArray.length > tickets.length) {
      setBatchError(`Not enough tickets: need ${txFieldsArray.length}, have ${tickets.length}`)
      return null
    }
    setBatchLoading(true)
    setBatchError('')
    try {
      const client = await ensureConnected()
      const built  = []
      for (let i = 0; i < txFieldsArray.length; i++) {
        const filled = await buildBatchTransaction(txFieldsArray[i], tickets[i], client)
        built.push(filled)
      }
      setBuiltBatch(built)
      return built
    } catch (e) {
      setBatchError(e.message)
      return null
    } finally {
      setBatchLoading(false)
    }
  }, [tickets, ensureConnected])

  // ── Submit batch ────────────────────────────────────────────────────────
  const submitBatch = useCallback(async () => {
    if (!builtBatch.length) {
      setSubmitError('No transactions to submit')
      return null
    }
    setSubmitLoading(true)
    setSubmitError('')
    try {
      const client = await ensureConnected()
      const w      = xrpl.Wallet.fromSeed(wallet.seed)
      const res    = await batchSubmit(builtBatch, client, w, (hash, index) => {
        addTx({ type: builtBatch[index]?.TransactionType ?? 'Batch tx', status: 'success', hash })
      })
      setResults(res)
      return res
    } catch (e) {
      setSubmitError(e.message)
      return null
    } finally {
      setSubmitLoading(false)
    }
  }, [builtBatch, wallet, ensureConnected, xrpl, addTx])

  // ── Reset ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setTickets([])
    setBuiltBatch([])
    setResults([])
    setTicketError('')
    setBatchError('')
    setSubmitError('')
  }, [])

  return {
    tickets, ticketLoading, ticketError, createTicketBatch,
    builtBatch, batchLoading, batchError, buildBatch,
    results, submitLoading, submitError, submitBatch,
    reset,
  }
}
