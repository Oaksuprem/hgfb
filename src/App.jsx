import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { XrplProvider } from './context/XrplContext'
import Navbar from './components/Navbar'
import InstallBanner from './components/InstallBanner'
import PortalJump from './components/PortalJump'
import LandingPage from './pages/LandingPage'
import AccountPage from './pages/AccountPage'
import SendPage from './pages/SendPage'
import TrustLinePage from './pages/TrustLinePage'
import DexPage from './pages/DexPage'
import SponsorPage from './pages/SponsorPage'
import MultisignPage from './pages/MultisignPage'
import { isIssueHost, isSameOriginAdminPath } from './lib/hosts'
import IssueApp from './issue/IssueApp.jsx'

export default function App() {
  if (isIssueHost() || isSameOriginAdminPath()) return <IssueApp />

  return (
    <XrplProvider>
      <BrowserRouter>
        <Navbar />
        <InstallBanner />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/trustlines" element={<TrustLinePage />} />
          <Route path="/dex" element={<DexPage />} />
          <Route path="/sponsor" element={<SponsorPage />} />
          <Route path="/multisign" element={<MultisignPage />} />
          <Route path="/issue" element={<PortalJump portal="admin" path="/issue" />} />
          <Route path="/oracle" element={<PortalJump portal="admin" path="/oracle" />} />
          <Route path="/permissioned-dex" element={<PortalJump portal="admin" path="/permissioned-dex" />} />
          <Route path="/confidential" element={<PortalJump portal="admin" path="/confidential" />} />
          <Route path="/confidential-tokens" element={<PortalJump portal="admin" path="/confidential" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </XrplProvider>
  )
}
