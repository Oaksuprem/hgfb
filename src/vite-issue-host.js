function isAdminHostHeader(host) {
  return host === 'admin.localhost'
    || host === 'issue.localhost'
    || host.startsWith('admin.')
    || host.startsWith('issue.')
}

function rewriteAdminHost(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase()
  if (!isAdminHostHeader(host)) return
  const url = req.url || '/'
  const path = url.split('?')[0]
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : ''
  const accept = String(req.headers.accept || '')
  const isDocument = path === '/' || path === '/index.html' || (accept.includes('text/html') && !path.includes('.'))
  if (isDocument) req.url = `/issue.html${query}`
}

export function issueHostPlugin() {
  return {
    name: 'hgfb-admin-host',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteAdminHost(req)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteAdminHost(req)
        next()
      })
    },
  }
}
