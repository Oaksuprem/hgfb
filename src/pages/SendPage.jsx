import { useState } from 'react'
import { useXrpl } from '../context/XrplContext'
import WalletCard from '../components/WalletCard'
import TxHistory from '../components/TxHistory'
import TokenSelect from '../components/TokenSelect'
import { txOutcome } from '../lib/tx'
import { amountOf, tokenById } from '../lib/tokens'

export default function SendPage() {
  const { xrpl, wallet, network, ensureConnected, addTx } = useXrpl()
  const [dest,     setDest]     = useState('')
  const [amount,   setAmount]   = useState('')
  const [tokenId,  setTokenId]  = useState('XRP')
  const [destTag,  setDestTag]  = useState('')
  const [memo,     setMemo]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const validate = () => {
    if (!wallet)               return 'Open a book first — Bank tab.'
    if (!dest.trim())          return 'Who are we sending to?'
    if (!xrpl.isValidAddress(dest.trim())) return 'That address isn’t valid.'
    if (!amount || isNaN(+amount) || +amount <= 0) return 'Enter an amount that actually moves.'
    const token = tokenById(network, tokenId)
    if (!token) return 'Pick an asset from the directory.'
    if (token.code !== 'XRP' && !xrpl.isValidAddress(token.issuer)) return 'That asset’s issuer isn’t a valid address.'
    if (destTag && (!/^\d+$/.test(destTag) || Number(destTag) > 4294967295)) {
      return 'Destination tag must be a whole number up to 4294967295.'
    }
    return null
  }

  const send = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true); setError('')
    try {
      const c = await ensureConnected()
      const w = xrpl.Wallet.fromSeed(wallet.seed)
      const token = tokenById(network, tokenId)
      const amt = amountOf(xrpl, token, amount)

      const tx = { TransactionType: 'Payment', Account: wallet.address, Destination: dest.trim(), Amount: amt }
      if (destTag) tx.DestinationTag = Number(destTag)
      if (memo.trim()) {
        tx.Memos = [{ Memo: { MemoData: xrpl.convertStringToHex(memo.trim()) } }]
      }

      const result = await c.submitAndWait(tx, { wallet: w })
      const { ok, tes } = txOutcome(result)
      addTx()
      if (!ok) setError(tes || 'Didn’t clear')
    } catch (e) { setError('Payment didn’t land: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-kicker">Pay</div>
        <h2>Send it. Don’t wait on it.</h2>
        <p>Move value globally — XRP or issued assets — with bank-grade rails and next-gen speed.</p>
      </div>

      <div className="grid-2">
        <div className="flow">
          {!wallet && <div className="alert alert-warning">Open a book on Bank first. Then this gets easy.</div>}
          {error    && <div className="alert alert-danger">{error}</div>}

          <div className="glass-card">
            <div className="section-title">Payment</div>
            <p className="muted">Straight to any XRPL address. Tag it if the desk requires one.</p>

            <div className="field">
              <label>To</label>
              <input type="text" placeholder="r…" value={dest} onChange={e => setDest(e.target.value)} />
            </div>

            <div className="field-row">
              <TokenSelect network={network} tokenId={tokenId} onChange={token => setTokenId(token.id)} />
              <div className="field">
                <label>Amount</label>
                <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="any" />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Dest tag</label>
                <input type="number" placeholder="Optional" value={destTag} onChange={e => setDestTag(e.target.value)} min="0" />
              </div>
              <div className="field">
                <label>Note</label>
                <input type="text" placeholder="On-chain memo" value={memo} onChange={e => setMemo(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={send} disabled={loading || !wallet}>
              {loading ? (<><span className="spinner"></span> Sending…</>) : 'Send now'}
            </button>
          </div>
        </div>

        <div className="flow">
          <WalletCard />
          <TxHistory />
        </div>
      </div>
    </div>
  )
}
