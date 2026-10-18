import { useState, useCallback } from 'react'
import { useXrpl } from '../../context/XrplContext'

/**
 * Hook for autofilling a single XRPL transaction.
 * Returns { builtTx, building, buildError, buildTransaction }
 */
export function useTxBuilder() {
  const { ensureConnected } = useXrpl()
  const [builtTx,    setBuiltTx]    = useState(null)
  const [building,   setBuilding]   = useState(false)
  const [buildError, setBuildError] = useState('')

  const buildTransaction = useCallback(async (txFields) => {
    setBuilding(true)
    setBuildError('')
    setBuiltTx(null)
    try {
      const client = await ensureConnected()
      const filled = await client.autofill(txFields)
      setBuiltTx(filled)
      return filled
    } catch (e) {
      setBuildError(e.message)
      return null
    } finally {
      setBuilding(false)
    }
  }, [ensureConnected])

  return { builtTx, building, buildError, buildTransaction }
}
