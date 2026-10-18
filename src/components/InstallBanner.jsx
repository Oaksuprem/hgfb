import { useEffect, useState } from 'react'

export default function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('pwa-install-dismissed') === '1')
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  )

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setPromptEvent(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || dismissed || !promptEvent) return null

  const install = async () => {
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
  }

  const dismiss = () => {
    sessionStorage.setItem('pwa-install-dismissed', '1')
    setDismissed(true)
  }

  return (
    <div className="install-banner">
      <div className="install-banner-text">
        <strong>Bank from your home screen</strong>
        <span>Install HGFB — Hell's Gate Finance Bank — as a Chrome app.</span>
      </div>
      <div className="install-banner-actions">
        <button className="btn btn-primary btn-sm" onClick={install}>Install</button>
        <button className="btn btn-secondary btn-sm" onClick={dismiss}>Later</button>
      </div>
    </div>
  )
}
