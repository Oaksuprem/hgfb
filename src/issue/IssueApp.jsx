import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { XrplProvider } from '../context/XrplContext'
import InstallBanner from '../components/InstallBanner'
import PortalJump from '../components/PortalJump'
import { adminOrigin } from '../lib/hosts'
import { loadBook, stageBookForHandoff } from '../lib/walletStore'
import { useXrpl } from '../context/XrplContext'
import IssueNavbar from './IssueNavbar.jsx'

function IssueAliasRedirect() {
  const { network } = useXrpl()
  useEffect(() => {
    const host = window.location.hostname.toLowerCase()
    const onAdmin = host === 'admin.localhost' || host.startsWith('admin.')
    if (onAdmin) return
    stageBookForHandoff(loadBook(), network)
    const next = adminOrigin() + window.location.pathname + window.location.search + window.location.hash
    if (!next.startsWith(window.location.origin)) window.location.replace(next)
  }, [network])
  return null
}
import IssuePage from '../pages/IssuePage.jsx'
import OraclePage from '../pages/OraclePage.jsx'
import PermissionedDexPage from '../pages/PermissionedDexPage.jsx'
import ConfidentialTokensPage from '../pages/ConfidentialTokensPage.jsx'

export default function IssueApp() {
  return (
    <XrplProvider>
      <BrowserRouter>
        <IssueAliasRedirect />
        <IssueNavbar />
        <InstallBanner />
        <Routes>
          <Route path="/" element={<Navigate to="/issue" replace />} />
          <Route path="/issue" element={<IssuePage />} />
          <Route path="/oracle" element={<OraclePage />} />
          <Route path="/permissioned-dex" element={<PermissionedDexPage />} />
          <Route path="/confidential" element={<ConfidentialTokensPage />} />
          <Route path="/confidential-tokens" element={<Navigate to="/confidential" replace />} />
          <Route path="/account" element={<PortalJump portal="bank" path="/account" />} />
          <Route path="/send" element={<PortalJump portal="bank" path="/send" />} />
          <Route path="/trustlines" element={<PortalJump portal="bank" path="/trustlines" />} />
          <Route path="/dex" element={<PortalJump portal="bank" path="/dex" />} />
          <Route path="/sponsor" element={<PortalJump portal="bank" path="/sponsor" />} />
          <Route path="/multisign" element={<PortalJump portal="bank" path="/multisign" />} />
          <Route path="*" element={<Navigate to="/issue" replace />} />
        </Routes>
      </BrowserRouter>
    </XrplProvider>
  )
}
