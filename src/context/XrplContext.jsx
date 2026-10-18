import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import * as xrpl from 'xrpl'
import { normalizeAccountTx } from '../lib/tx'
import { loadBook, saveBook } from '../lib/walletStore'

const XrplContext = createContext(null)

export const NETWORKS = {
  devnet:  'wss://s.devnet.rippletest.net:51233',
  testnet: 'wss://s.altnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com',
}

export const EXPLORERS = {
  devnet:  'https://devnet.xrpl.org',
  testnet: 'https://testnet.xrpl.org',
  mainnet: 'https://livenet.xrpl.org',
}

const savedNetwork = () => {
  try {
    const n = localStorage.getItem('xrpl-network')
    return n && NETWORKS[n] ? n : 'devnet'
  } catch {
    return 'devnet'
  }
}

function withKeys(book) {
  if (!book) return null
  if (!book.seed) return book
  try {
    const full = xrpl.Wallet.fromSeed(book.seed)
    return {
      address: full.address,
      seed: full.seed,
      publicKey: full.publicKey,
      privateKey: full.privateKey,
    }
  } catch {
    return book
  }
}

export function XrplProvider({ children }) {
  const [network,    setNetwork]    = useState(savedNetwork)
  const [connected,  setConnected]  = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [wallet,     setWalletState]= useState(() => {
    const book = withKeys(loadBook())
    if (book?.privateKey) saveBook(book)
    return book
  })
  const [txHistory,  setTxHistory]  = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const clientRef = useRef(null)
  const walletRef = useRef(wallet)
  walletRef.current = wallet

  const setWallet = useCallback((w) => {
    const book = w ? withKeys(w) : null
    setWalletState(book)
    saveBook(book)
  }, [])

  const connect = useCallback(async (net) => {
    const target = net || network
    setConnecting(true)
    try {
      if (clientRef.current) {
        try { await clientRef.current.disconnect() } catch (_) {}
      }
      const c = new xrpl.Client(NETWORKS[target])
      await c.connect()
      clientRef.current = c
      setConnected(true)
      setNetwork(target)
      try { localStorage.setItem('xrpl-network', target) } catch (_) {}
      return c
    } catch (err) {
      setConnected(false)
      throw err
    } finally {
      setConnecting(false)
    }
  }, [network])

  const disconnect = useCallback(async () => {
    if (clientRef.current) {
      try { await clientRef.current.disconnect() } catch (_) {}
      clientRef.current = null
      setConnected(false)
    }
  }, [])

  const ensureConnected = useCallback(async () => {
    if (clientRef.current && clientRef.current.isConnected()) return clientRef.current
    return connect()
  }, [connect])

  const refreshHistory = useCallback(async (addr) => {
    const address = addr || walletRef.current?.address
    if (!address) {
      setTxHistory([])
      return
    }
    setHistoryLoading(true)
    try {
      const c = await ensureConnected()
      const r = await c.request({
        command: 'account_tx',
        account: address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: false,
        forward: false,
        limit: 40,
      })
      const list = (r.result.transactions || []).map(w => normalizeAccountTx(w, address))
      setTxHistory(list)
    } catch {
      setTxHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [ensureConnected])

  const addTx = useCallback(() => {
    refreshHistory().catch(() => {})
  }, [refreshHistory])

  useEffect(() => {
    connect().catch(() => {})
    return () => { if (clientRef.current) { try { clientRef.current.disconnect() } catch (_) {} } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!wallet?.address) {
      setTxHistory([])
      return
    }
    refreshHistory(wallet.address)
  }, [wallet?.address, network, connected, refreshHistory])

  useEffect(() => {
    if (!wallet?.address || !connected) return
    const address = wallet.address
    let handler = null
    let client = null
    let cancelled = false

    ;(async () => {
      try {
        client = await ensureConnected()
        if (cancelled || client !== clientRef.current) return
        await client.request({ command: 'subscribe', accounts: [address] })
        handler = (ev) => {
          if (ev?.validated === false) return
          refreshHistory(address)
        }
        client.on('transaction', handler)
      } catch (_) {}
    })()

    return () => {
      cancelled = true
      if (client && handler) {
        try { client.off('transaction', handler) } catch (_) {}
        client.request({ command: 'unsubscribe', accounts: [address] }).catch(() => {})
      }
    }
  }, [wallet?.address, connected, network, ensureConnected, refreshHistory])

  return (
    <XrplContext.Provider value={{
      network, connected, connecting,
      wallet, setWallet,
      txHistory, addTx, refreshHistory, historyLoading,
      connect, disconnect, ensureConnected,
      xrpl,
    }}>
      {children}
    </XrplContext.Provider>
  )
}

export const useXrpl = () => {
  const ctx = useContext(XrplContext)
  if (!ctx) throw new Error('useXrpl must be inside XrplProvider')
  return ctx
}
