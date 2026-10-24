const KEY = 'xrpl-wallet'
const HANDOFF = 'hgfb1:'
const RAILS = ['devnet', 'testnet', 'mainnet']

function currentNetwork() {
  try {
    const n = localStorage.getItem('xrpl-network')
    if (RAILS.includes(n)) return n
  } catch { /* private mode */ }
  return 'devnet'
}

function slotKey(network) {
  return `${KEY}:${network}`
}

function readJson(raw) {
  if (!raw) return null
  try {
    const book = JSON.parse(raw)
    if (book && book.address && (book.seed || book.privateKey)) return book
  } catch { /* ignore corrupt storage */ }
  return null
}

function stripRail(book) {
  if (!book) return null
  const { rail, ...rest } = book
  if (!rest.address || !(rest.seed || rest.privateKey)) return null
  return rest
}

function writeBook(book) {
  try {
    if (book) localStorage.setItem(KEY, JSON.stringify(book))
    else localStorage.removeItem(KEY)
  } catch { /* private mode */ }
}

function clearSlots() {
  try {
    for (const network of RAILS) localStorage.removeItem(slotKey(network))
  } catch { /* private mode */ }
}

function readSlotBook() {
  const order = [currentNetwork(), ...RAILS.filter(network => network !== currentNetwork())]
  try {
    for (const network of order) {
      const book = readJson(localStorage.getItem(slotKey(network)))
      if (book) return stripRail(book)
    }
  } catch { /* private mode */ }
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

function clearCookie() {
  try {
    const attrs = 'Path=/; SameSite=Lax; Max-Age=0'
    document.cookie = `hgfb-wallet=; ${attrs}`
    const domain = cookieDomain()
    if (domain) document.cookie = `hgfb-wallet=; ${attrs}; Domain=${domain}`
  } catch { /* cookies unavailable */ }
}

function readStored() {
  let book = null
  try { book = readJson(localStorage.getItem(KEY)) } catch { book = null }
  if (!book) {
    try { book = readJson(sessionStorage.getItem(KEY)) } catch { book = null }
  }
  if (!book) book = readCookie()
  if (!book) book = readSlotBook()
  return stripRail(book)
}

function clearExtras() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  clearSlots()
  clearCookie()
}

function consumeHandoff() {
  try {
    if (typeof window.name === 'string' && window.name.startsWith(HANDOFF)) {
      const book = readJson(window.name.slice(HANDOFF.length))
      window.name = ''
      return book
    }
  } catch { /* ignore */ }
  return null
}

function adoptHandoff() {
  const handed = consumeHandoff()
  if (!handed) return
  const book = stripRail(handed)
  if (!book) return
  writeBook(book)
  clearExtras()
  if (RAILS.includes(handed.rail)) {
    try { localStorage.setItem('xrpl-network', handed.rail) } catch { /* ignore */ }
  }
}

export function stageBookForHandoff(book, network) {
  try {
    if (!book) { window.name = ''; return }
    const rail = RAILS.includes(network) ? network : currentNetwork()
    window.name = HANDOFF + JSON.stringify({ ...book, rail })
  } catch { /* ignore */ }
}

export function prepareBooks() {
  adoptHandoff()
}

export function loadBook() {
  const book = readStored()
  if (book) {
    writeBook(book)
    clearExtras()
  }
  return book
}

export function saveBook(book) {
  const clean = book ? stripRail(book) : null
  writeBook(clean)
  clearExtras()
}

export function confirmLiveRail(net) {
  if (net !== 'mainnet') return true
  return window.confirm('Switch to the live XRP Ledger? Transactions on this rail move real value. This device keeps one book, and each rail shows that account’s balance, assets, and history.')
}
