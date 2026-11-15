/**
 * Batch Utilities — XRPL Ticket-based parallel transaction batching
 */

/** Prefer tickets or transactions just produced in this turn over the list React has not stored yet. */
export function freshOrSaved(fresh, saved) {
  return fresh ?? saved ?? []
}

/**
 * Create tickets (2–250) by submitting TicketCreate.
 * Returns sorted array of ticket sequence numbers.
 */
export async function createTickets(account, count, client, wallet) {
  if (count < 2 || count > 250) {
    throw new Error(`Ticket count must be 2–250, got ${count}`)
  }
  const result = await client.submitAndWait(
    { TransactionType: 'TicketCreate', Account: account, TicketCount: count },
    { wallet, autofill: true }
  )
  const meta = result.result.meta
  if (meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`TicketCreate failed: ${meta.TransactionResult}`)
  }
  const tickets = []
  for (const node of (meta.AffectedNodes ?? [])) {
    if (node.CreatedNode?.LedgerEntryType === 'Ticket') {
      const seq = node.CreatedNode.NewFields?.TicketSequence
      if (seq !== undefined) tickets.push(seq)
    }
  }
  if (!tickets.length) throw new Error('No ticket sequences found in metadata')
  return tickets.sort((a, b) => a - b)
}

/** A ticket transaction must carry Sequence 0. A non-zero Sequence is temSEQ_AND_TICKET. */
export function applyTicket(tx, ticketSequence) {
  return { ...tx, TicketSequence: ticketSequence, Sequence: 0 }
}

/** Unused tickets already on the account, or null when a new TicketCreate is required. */
export function selectTickets(existing, count) {
  const have = [...existing].filter(n => Number.isInteger(n)).sort((a, b) => a - b)
  if (have.length >= count) return have.slice(0, count)
  return null
}

export async function reusableTickets(client, account, count) {
  const r = await client.request({
    command: 'account_objects',
    account,
    type: 'ticket',
    ledger_index: 'validated',
  })
  const sequences = (r.result.account_objects ?? []).map(o => o.TicketSequence)
  return selectTickets(sequences, count)
}

/**
 * Autofill Fee and LastLedgerSequence, then pin Sequence to 0 beside the ticket.
 * The later submit must not autofill again: a missing Sequence is replaced with
 * the account sequence and the ledger rejects the transaction.
 */
export async function buildBatchTransaction(txFields, ticketSequence, client) {
  const draft = { ...txFields, TicketSequence: ticketSequence }
  delete draft.Sequence
  const filled = await client.autofill(draft)
  return applyTicket(filled, ticketSequence)
}

/**
 * Submit an array of autofilled transactions in parallel with Promise.allSettled.
 * Returns: Array<{ success, hash?, error?, index }>
 */
export async function submitBatch(transactions, client, wallet, onTxComplete) {
  const results = await Promise.allSettled(
    transactions.map((tx, index) =>
      client.submitAndWait(applyTicket(tx, tx.TicketSequence), { wallet, autofill: false })
        .then(res => {
          const hash    = res.result.hash
          const tes     = res.result.meta.TransactionResult
          const success = tes === 'tesSUCCESS'
          if (onTxComplete) onTxComplete(hash, index)
          return { success, hash, error: success ? undefined : tes, index }
        })
        .catch(err => ({ success: false, error: err.message, index }))
    )
  )
  return results.map((r, index) =>
    r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message ?? 'Unknown', index }
  )
}
