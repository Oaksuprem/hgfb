const ADMIN_PATHS = ['/issue', '/oracle', '/permissioned-dex', '/confidential', '/confidential-tokens']

function isPortalHost(hostname, label) {
  const host = hostname.toLowerCase()
  return host === `${label}.localhost` || host.startsWith(`${label}.`)
}

export function sameOriginPortals(hostname = window.location.hostname) {
  return hostname.toLowerCase().endsWith('.vercel.app')
}

export function isSameOriginAdminPath(pathname = window.location.pathname) {
  if (!sameOriginPortals()) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  return ADMIN_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

export function isAdminHost(hostname = window.location.hostname) {
  return isPortalHost(hostname, 'admin') || isPortalHost(hostname, 'issue')
}

export function isIssueHost(hostname = window.location.hostname) {
  return isAdminHost(hostname)
}

export function withPort(protocol, host) {
  const port = window.location.port
  return `${protocol}//${host}${port ? `:${port}` : ''}`
}

export function bankOrigin() {
  if (sameOriginPortals()) return window.location.origin
  const { protocol, hostname } = window.location
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === 'admin.localhost' || host === 'issue.localhost') {
    return withPort(protocol, host === '127.0.0.1' ? '127.0.0.1' : 'localhost')
  }
  if (host.startsWith('admin.')) return withPort(protocol, host.slice('admin.'.length))
  if (host.startsWith('issue.')) return withPort(protocol, host.slice('issue.'.length))
  return window.location.origin
}

export function adminOrigin() {
  if (sameOriginPortals()) return window.location.origin
  const { protocol, hostname } = window.location
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === 'admin.localhost' || host === 'issue.localhost') {
    return withPort(protocol, 'admin.localhost')
  }
  if (host.startsWith('admin.')) return window.location.origin
  if (host.startsWith('issue.')) return withPort(protocol, `admin.${host.slice('issue.'.length)}`)
  return withPort(protocol, `admin.${hostname}`)
}

export function issueOrigin() {
  return adminOrigin()
}
