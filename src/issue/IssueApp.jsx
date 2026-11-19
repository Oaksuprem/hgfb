import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import InsurancePage from '../pages/InsurancePage.jsx'
import PropertiesPage from '../pages/PropertiesPage.jsx'
import CreditPage from '../pages/CreditPage.jsx'

function KeepAlive({ active, children }) {
  const [seen, setSeen] = useState(active)
  if (active && !seen) setSeen(true)
  if (!seen) return null
  return <div hidden={!active}>{children}</div>
}

function DeskRoutes() {
  const { pathname } = useLocation()
  const path = pathname.replace(/\/+$/, '') || '/'
  const insurance = path === '/insurance' || path.startsWith('/insurance/')
  const properties = path === '/properties' || path.startsWith('/properties/')
  const credit = path === '/credit' || path.startsWith('/credit/')
  return (
    <>
      <KeepAlive active={insurance}><InsurancePage /></KeepAlive>
      <KeepAlive active={properties}><PropertiesPage /></KeepAlive>
      <KeepAlive active={credit}><CreditPage /></KeepAlive>
      {insurance || properties || credit ? null : (
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
          <Route path="/activate" element={<PortalJump portal="bank" path="/activate" />} />
          <Route path="*" element={<Navigate to="/issue" replace />} />
        </Routes>
      )}
    </>
  )
}

export default function IssueApp() {
  return (
    <XrplProvider>
      <BrowserRouter>
        <IssueAliasRedirect />
        <IssueNavbar />
        <InstallBanner />
        <DeskRoutes />
      </BrowserRouter>
    </XrplProvider>
  )
}
