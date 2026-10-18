import { useEffect } from 'react'
import { adminOrigin, bankOrigin } from '../lib/hosts'
import { loadBook, stageBookForHandoff } from '../lib/walletStore'

export default function PortalJump({ portal, path }) {
  useEffect(() => {
    stageBookForHandoff(loadBook())
    const origin = portal === 'admin' ? adminOrigin() : bankOrigin()
    const next = `${origin}${path}`
    const here = `${window.location.origin}${window.location.pathname.replace(/\/+$/, '') || '/'}`
    if (next !== here) window.location.replace(next)
  }, [portal, path])

  const label = portal === 'admin' ? 'the admin desk' : 'your bank'
  return (
    <div className="page">
      <p className="muted">Opening {label}…</p>
    </div>
  )
}
