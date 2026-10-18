/**
 * Batch Utilities — XRPL Ticket-based parallel transaction batching
 */

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

/**
 * Autofill a transaction using a ticket instead of Sequence.
 * Sets TicketSequence, removes Sequence, fills Fee + LastLedgerSequence.
 */
export async function buildBatchTransaction(txFields, ticketSequence, client) {
  const tx = { ...txFields, TicketSequence: ticketSequence, Sequence: 0 }
  const filled = await client.autofill(tx)
  delete filled.Sequence
  filled.TicketSequence = ticketSequence   // restore in case autofill overwrote
  return filled
}

/**
 * Submit an array of autofilled transactions in parallel with Promise.allSettled.
 * Returns: Array<{ success, hash?, error?, index }>
 */
export async function submitBatch(transactions, client, wallet, onTxComplete) {
  const results = await Promise.allSettled(
    transactions.map((tx, index) =>
      client.submitAndWait(tx, { wallet })
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
