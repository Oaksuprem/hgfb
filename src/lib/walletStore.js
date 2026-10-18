const KEY = 'xrpl-wallet'
const HANDOFF = 'hgfb1:'

function readJson(raw) {
  if (!raw) return null
  try {
    const book = JSON.parse(raw)
    if (book && book.address && (book.seed || book.privateKey)) return book
  } catch { /* ignore corrupt storage */ }
  return null
}

function cookieDomain() {
  const host = window.location.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost'
  const parts = host.split('.')
  if (parts.length >= 2) return parts.slice(-2).join('.')
  return ''
}

function readCookie() {
  try {
    const parts = document.cookie.split(';')
    for (const part of parts) {
      const [name, ...rest] = part.trim().split('=')
      if (name === 'hgfb-wallet') return readJson(decodeURIComponent(rest.join('=')))
    }
  } catch { /* cookies unavailable */ }
  return null
}

function writeCookie(book) {
  try {
    const value = book ? encodeURIComponent(JSON.stringify(book)) : ''
    const maxAge = book ? 60 * 60 * 24 * 365 : 0
    const attrs = `Path=/; SameSite=Lax; Max-Age=${maxAge}`
    const domain = cookieDomain()
    document.cookie = `hgfb-wallet=${value}; ${attrs}`
    if (domain) document.cookie = `hgfb-wallet=${value}; ${attrs}; Domain=${domain}`
  } catch { /* storage may be blocked */ }
}

function writeLocal(book) {
  try {
    if (book) localStorage.setItem(KEY, JSON.stringify(book))
    else localStorage.removeItem(KEY)
  } catch { /* private mode */ }
}

export function consumeHandoff() {
  try {
    if (typeof window.name === 'string' && window.name.startsWith(HANDOFF)) {
      const book = readJson(window.name.slice(HANDOFF.length))
      window.name = ''
      return book
    }
  } catch { /* ignore */ }
  return null
}

export function stageBookForHandoff(book) {
  try {
    window.name = book ? HANDOFF + JSON.stringify(book) : ''
  } catch { /* ignore */ }
}

export function loadBook() {
  const handed = consumeHandoff()
  if (handed) {
    writeLocal(handed)
    writeCookie(handed)
    return handed
  }

  let book = null
  try { book = readJson(localStorage.getItem(KEY)) } catch { book = null }

  if (!book) {
    try { book = readJson(sessionStorage.getItem(KEY)) } catch { book = null }
    if (book) {
      writeLocal(book)
      writeCookie(book)
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    }
  }

  if (!book) {
    book = readCookie()
    if (book) writeLocal(book)
  }

  return book
}

export function saveBook(book) {
  writeLocal(book)
  writeCookie(book)
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
