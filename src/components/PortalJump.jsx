import { useEffect } from 'react'
import { adminOrigin, bankOrigin } from '../lib/hosts'
import { loadBook, stageBookForHandoff } from '../lib/walletStore'
import { useXrpl } from '../context/XrplContext'

export default function PortalJump({ portal, path }) {
  const { network } = useXrpl()
  useEffect(() => {
    stageBookForHandoff(loadBook(), network)
    const origin = portal === 'admin' ? adminOrigin() : bankOrigin()
    const next = `${origin}${path}`
    const here = `${window.location.origin}${window.location.pathname.replace(/\/+$/, '') || '/'}`
    if (next !== here) window.location.replace(next)
  }, [portal, path, network])

  const label = portal === 'admin' ? 'the admin desk' : 'your bank'
  return (
    <div className="page">
      <p className="muted">Opening {label}…</p>
    </div>
  )
}
