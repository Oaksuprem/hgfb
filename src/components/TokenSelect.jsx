import { listTokens, tokenById } from '../lib/tokens'

export default function TokenSelect({
  network,
  tokenId,
  onChange,
  allowXrp = true,
  label = 'Asset',
}) {
  const options = listTokens(network, { allowXrp })
  const current = tokenById(network, tokenId, { allowXrp })

  if (!options.length || !current) {
    return <p className="muted">No issued assets are listed for this rail yet. Add them in the token directory.</p>
  }

  return (
    <div className="field">
      <label>{label}</label>
      <select
        value={current.id}
        onChange={e => onChange(tokenById(network, e.target.value, { allowXrp }))}
      >
        {options.map(token => (
          <option key={token.id} value={token.id}>{token.label}</option>
        ))}
      </select>
      {current.issuer ? (
        <p className="token-issuer">Issuer {current.issuer}</p>
      ) : options.length === 1 ? (
        <p className="token-issuer">No issued assets are listed for this rail. XRP is ready.</p>
      ) : null}
    </div>
  )
}
