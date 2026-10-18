import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useXrpl } from '../context/XrplContext'
import { adminOrigin } from '../lib/hosts'
import { loadBook, stageBookForHandoff } from '../lib/walletStore'

const TABS = [
  { path: '/account',    label: 'Bank'    },
  { path: '/send',       label: 'Pay'     },
  { path: '/trustlines', label: 'Assets'  },
  { path: '/dex',        label: 'Invest'  },
  { path: '/sponsor',    label: 'Co-sign' },
]

export default function Navbar() {
  const { connected, connecting, network, wallet, connect } = useXrpl()
  const [switching, setSwitching] = useState(false)

  const handleNet = async (net) => {
    if (net === network) return
    setSwitching(true)
    try { await connect(net) } catch (e) { console.error(e) }
    finally { setSwitching(false) }
  }

  const addr = wallet
    ? wallet.address.slice(0, 6) + '…' + wallet.address.slice(-4)
    : null

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-brand">
          <span className="brand-mark">HG</span>
          <span className="brand-stack">
            <span className="brand-name">HGFB</span>
            <span className="brand-sub">Hell's Gate</span>
          </span>
        </NavLink>

        <div className="navbar-tabs">
          {TABS.map(t => (
            <NavLink
              key={t.path}
              to={t.path}
              className={({ isActive }) => 'nav-tab' + (isActive ? ' nav-tab-active' : '')}
            >
              {t.label}
            </NavLink>
          ))}
          <a
            className="nav-tab"
            href={`${adminOrigin()}/issue`}
            onClick={() => stageBookForHandoff(loadBook())}
          >Admin</a>
        </div>

        <div className="navbar-right">
          <select
            className="net-select"
            value={network}
            onChange={e => handleNet(e.target.value)}
            disabled={switching}
          >
            <option value="devnet">Devnet</option>
            <option value="testnet">Testnet</option>
            <option value="mainnet">Live ⚠</option>
          </select>

          <div className={'badge ' + (connected ? 'badge-connected' : 'badge-disconnected')}>
            <span className={'dot ' + (connected ? 'dot-green' : 'dot-red')}></span>
            {connecting ? 'Linking…' : connected ? 'Live' : 'Offline'}
          </div>

          {addr && <div className="navbar-wallet mono">{addr}</div>}
        </div>
      </div>
    </nav>
  )
}
