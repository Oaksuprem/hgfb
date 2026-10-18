import { useState, useCallback } from 'react'
import { useXrpl } from '../../context/XrplContext'

/**
 * Hook for submitting a single XRPL transaction.
 * Returns { result, submitting, submitError, success, submitTransaction }
 */
export function useTxSubmit() {
  const { xrpl, wallet, ensureConnected, addTx } = useXrpl()
  const [result,      setResult]      = useState(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')

  const submitTransaction = useCallback(async (transaction, walletSeed) => {
    setSubmitting(true)
    setSubmitError('')
    setResult(null)
    try {
      const client = await ensureConnected()
      const seed   = walletSeed ?? wallet?.seed
      if (!seed) throw new Error('No wallet seed available')
      const w   = xrpl.Wallet.fromSeed(seed)
      const res = await client.submitAndWait(transaction, { wallet: w })
      setResult(res)
      const ok  = res.result.meta.TransactionResult === 'tesSUCCESS'
      addTx({
        type:   transaction.TransactionType,
        status: ok ? 'success' : 'error',
        hash:   res.result.hash,
      })
      return res
    } catch (e) {
      setSubmitError(e.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [xrpl, wallet, ensureConnected, addTx])

  const success = result?.result?.meta?.TransactionResult === 'tesSUCCESS'
  return { result, submitting, submitError, success, submitTransaction }
}
