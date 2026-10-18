import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Animated counter ────────────────────────────────────────────────────────

function Counter({ target, suffix = '', duration = 1800 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      el.textContent = Math.floor(eased * target).toLocaleString() + suffix
      if (progress < 1) requestAnimationFrame(step)
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { requestAnimationFrame(step); obs.disconnect() }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target, duration, suffix])
  return <span ref={ref}>0{suffix}</span>
}

// ─── Feature card ────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, body, accent }) {
  return (
    <div className="lp-feature-card" style={{ '--f-accent': accent }}>
      <div className="lp-feature-icon">{icon}</div>
      <div className="lp-feature-title">{title}</div>
      <div className="lp-feature-body">{body}</div>
    </div>
  )
}

// ─── Stat block ──────────────────────────────────────────────────────────────

function Stat({ value, suffix, label }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat-value">
        <Counter target={value} suffix={suffix} />
      </div>
      <div className="lp-stat-label">{label}</div>
    </div>
  )
}

// ─── Use-case pill ────────────────────────────────────────────────────────────

function Pill({ children, href }) {
  return (
    <a href={href} className="lp-pill" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

// ─── Audience section ────────────────────────────────────────────────────────

function AudienceCard({ eyebrow, headline, bullets, cta, onClick }) {
  return (
    <div className="lp-audience-card">
      <div className="lp-audience-eyebrow">{eyebrow}</div>
      <div className="lp-audience-headline">{headline}</div>
      <ul className="lp-audience-list">
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
      <button className="btn btn-primary" onClick={onClick}>{cta}</button>
    </div>
  )
}

// ─── Main landing page ───────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="lp-root">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-bg" aria-hidden="true">
          <div className="lp-orb lp-orb-1" />
          <div className="lp-orb lp-orb-2" />
          <div className="lp-orb lp-orb-3" />
          {/* Animated grid */}
          <div className="lp-grid-lines" />
        </div>

        <div className="lp-hero-inner">
          <div className="lp-hero-badge">
            <span className="lp-live-dot" />
            Live on XRP Ledger · Devnet · Testnet · Mainnet
          </div>

          <h1 className="lp-hero-h1">
            Transact at the
            <br />
            <span className="lp-gradient-text">speed of thought.</span>
          </h1>

          <p className="lp-hero-sub">
            Trade global assets, issue tokenized securities, and move value across
            borders in under 4 seconds — with institutional-grade compliance built in.
          </p>

          <div className="lp-hero-actions">
            <button
              className="btn btn-primary lp-btn-lg"
              onClick={() => navigate('/account')}
            >
              Open your account
            </button>
            <button
              className="btn btn-secondary lp-btn-lg"
              onClick={() => navigate('/permissioned-dex')}
            >
              Explore permissioned trading →
            </button>
          </div>

          <div className="lp-hero-pills">
            <Pill href="https://xrpl.org">XRPL Protocol</Pill>
            <Pill href="https://xrpl.org/docs/concepts/tokens/decentralized-exchange/permissioned-dexes">Permissioned DEX</Pill>
            <Pill href="https://xls.xrpl.org/xls/XLS-0096-confidential-mpt.html">Confidential Tokens</Pill>
            <Pill href="https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens">MPT</Pill>
            <Pill href="https://xrpl.org/docs/concepts/decentralized-exchange/automated-market-makers">AMM</Pill>
          </div>
        </div>

        {/* Hero illustration */}
        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-ledger-card">
            <div className="lp-ledger-header">
              <span className="lp-ledger-label">Latest block</span>
              <span className="lp-ledger-badge">Validated</span>
            </div>
            <div className="lp-ledger-rows">
              {[
                { type: 'Payment',        amt: '1,200 XRP',  st: 'success' },
                { type: 'OfferCreate',    amt: 'USD → XRP',  st: 'success' },
                { type: 'MPTokenTransfer',amt: '500 CTST',   st: 'success' },
                { type: 'ConfidentialTx', amt: '███ ████',   st: 'conf'    },
                { type: 'TrustSet',       amt: 'EUR/HGFB',   st: 'success' },
              ].map((r, i) => (
                <div className="lp-ledger-row" key={i} style={{ animationDelay: `${i * 0.12}s` }}>
                  <span className={`lp-ledger-dot lp-dot-${r.st}`} />
                  <span className="lp-ledger-type">{r.type}</span>
                  <span className="lp-ledger-amt">{r.amt}</span>
                </div>
              ))}
            </div>
            <div className="lp-ledger-footer">
              <span className="lp-ledger-time">⚡ 3.8 s avg close</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="lp-stats-band">
        <div className="lp-stats-inner">
          <Stat value={4}      suffix="s"   label="Average ledger close" />
          <Stat value={1500}   suffix="+"   label="Transactions per second" />
          <Stat value={530}    suffix="M+"  label="USD tokenized assets targeted" />
          <Stat value={200}    suffix="+"   label="Countries reached" />
        </div>
      </section>

      {/* ── Who it's for ──────────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-tag">Built for everyone who moves money seriously</div>
          <h2 className="lp-section-h2">
            One platform.<br />Every participant.
          </h2>
          <div className="lp-audience-grid">
            <AudienceCard
              eyebrow="For institutions"
              headline="Compliant trading at global scale"
              bullets={[
                'Permissioned DEX with credential-gated order books',
                'Confidential token balances with auditor access',
                'Multi-signature approval workflows',
                'Fee sponsorship for your users',
              ]}
              cta="Start permissioned trading"
              onClick={() => navigate('/permissioned-dex')}
            />
            <AudienceCard
              eyebrow="For individuals"
              headline="Own your assets. Move them anywhere."
              bullets={[
                'Self-custodial wallet — your keys, your tokens',
                'Trade 200+ currency pairs on the open DEX',
                'Receive tokenized real-world assets instantly',
                'Earn yield by providing AMM liquidity',
              ]}
              cta="Open your account"
              onClick={() => navigate('/account')}
            />
            <AudienceCard
              eyebrow="For issuers"
              headline="Tokenize anything. Distribute globally."
              bullets={[
                'Issue fungible tokens, NFTs, and multi-purpose tokens',
                'Confidential balances with selective auditor disclosure',
                'On-ledger price oracles for real-time NAV',
                'Clawback and freeze controls for regulated assets',
              ]}
              cta="Issue a token"
              onClick={() => navigate('/issue')}
            />
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-inner">
          <div className="lp-section-tag">What you can do</div>
          <h2 className="lp-section-h2">Everything the ledger offers,<br />in one interface.</h2>
          <div className="lp-features-grid">
            <FeatureCard
              icon="🔒"
              accent="var(--teal)"
              title="Permissioned DEX"
              body="Create credential-gated trading domains. Only vetted counterparties can place or match orders — ideal for regulated securities and cross-border FX."
            />
            <FeatureCard
              icon="🕵️"
              accent="var(--purple)"
              title="Confidential Tokens"
              body="Issue MPTs with EC-ElGamal encrypted balances. Transfer amounts stay masked on-ledger while issuers and designated auditors retain selective visibility."
            />
            <FeatureCard
              icon="⚡"
              accent="var(--accent)"
              title="Instant Payments"
              body="Send XRP and any issued token globally in under 4 seconds. Add memos, destination tags, and path-finding for cross-currency settlement."
            />
            <FeatureCard
              icon="🌊"
              accent="var(--ember)"
              title="AMM Liquidity"
              body="Create or deposit into automated market maker pools. Vote on fees, bid for the auction slot discount, and earn yield proportional to your share."
            />
            <FeatureCard
              icon="🪙"
              accent="var(--yellow)"
              title="Multi-Purpose Tokens"
              body="MPTs are low-overhead on-ledger tokens ideal for stablecoins, RWA shares, and loyalty points — with built-in transfer controls and clawback."
            />
            <FeatureCard
              icon="✍️"
              accent="var(--green)"
              title="Multi-Signature"
              body="Require M-of-N signers to authorise any transaction. Build approval workflows, treasury controls, and institutional custody without external infrastructure."
            />
            <FeatureCard
              icon="📡"
              accent="var(--teal)"
              title="On-Chain Oracles"
              body="Publish and query price feeds directly on the XRP Ledger. Multiple oracle sources are aggregated on-chain for tamper-resistant NAV and reference rates."
            />
            <FeatureCard
              icon="🤝"
              accent="var(--purple)"
              title="Fee Sponsorship"
              body="Sponsor transaction fees for your users. Enable gasless UX for onboarding flows, enterprise applications, and delegated custody arrangements."
            />
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-section-tag">How it works</div>
          <h2 className="lp-section-h2">From key to cleared trade<br />in three steps.</h2>
          <div className="lp-steps-row">
            <div className="lp-step-card">
              <div className="lp-step-num">01</div>
              <div className="lp-step-title">Open your account</div>
              <div className="lp-step-body">
                Generate or import a wallet. Fund it from the testnet faucet or deposit XRP.
                Your seed never leaves your browser.
              </div>
            </div>
            <div className="lp-step-arrow">→</div>
            <div className="lp-step-card">
              <div className="lp-step-num">02</div>
              <div className="lp-step-title">Configure your rails</div>
              <div className="lp-step-body">
                Open trust lines for the assets you want. Set up credentials for permissioned
                markets. Issue your own tokens if needed.
              </div>
            </div>
            <div className="lp-step-arrow">→</div>
            <div className="lp-step-card">
              <div className="lp-step-num">03</div>
              <div className="lp-step-title">Trade and transact</div>
              <div className="lp-step-body">
                Place orders, send payments, provide liquidity, and manage confidential
                positions — all confirmed on-ledger in seconds.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Compliance callout ────────────────────────────────────────────── */}
      <section className="lp-section lp-section-alt">
        <div className="lp-section-inner lp-compliance-row">
          <div className="lp-compliance-text">
            <div className="lp-section-tag">Designed for regulated markets</div>
            <h2 className="lp-section-h2" style={{ marginBottom: 14 }}>
              Compliance isn't a layer.<br />It's built into the protocol.
            </h2>
            <p className="lp-compliance-body">
              The XRP Ledger's permissioned domains let any institution define exactly
              who trades in their order books — enforced at the protocol level, not
              by a third-party intermediary. Pair that with confidential token balances,
              auditor key registration, and credential-based KYC and you have the
              compliance stack regulated markets demand, with none of the overhead.
            </p>
            <div className="lp-compliance-chips">
              <span className="lp-chip">Credential-gated DEX</span>
              <span className="lp-chip">EC-ElGamal encryption</span>
              <span className="lp-chip">Auditor key registration</span>
              <span className="lp-chip">Issuer clawback</span>
              <span className="lp-chip">Freeze controls</span>
              <span className="lp-chip">Multi-sig treasury</span>
            </div>
          </div>
          <div className="lp-compliance-visual" aria-hidden="true">
            <div className="lp-flow-diagram">
              <div className="lp-flow-node lp-flow-issuer">Issuer</div>
              <div className="lp-flow-line" />
              <div className="lp-flow-node lp-flow-domain">Permissioned<br />Domain</div>
              <div className="lp-flow-line" />
              <div className="lp-flow-node lp-flow-trader">Credentialed<br />Trader</div>
              <div className="lp-flow-aside">
                <div className="lp-flow-node lp-flow-auditor">Auditor</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-headline">Ready to transact at the speed of thought?</h2>
          <p className="lp-cta-sub">
            Open an account on devnet in seconds. No installation, no sign-up.
          </p>
          <div className="lp-hero-actions">
            <button
              className="btn btn-primary lp-btn-lg"
              onClick={() => navigate('/account')}
            >
              Get started — it's free
            </button>
            <button
              className="btn btn-secondary lp-btn-lg"
              onClick={() => navigate('/confidential-tokens')}
            >
              Try confidential tokens →
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="brand-mark" style={{ width: 24, height: 24, fontSize: '.56rem' }}>HG</span>
            <span>
              <span className="brand-name">HGFB</span>
              <span className="brand-sub" style={{ display: 'block' }}>Hell's Gate</span>
            </span>
          </div>
          <div className="lp-footer-links">
            <a href="https://xrpl.org" target="_blank" rel="noopener noreferrer">XRPL.org</a>
            <a href="https://xls.xrpl.org/xls/XLS-0081-permissioned-dex.html" target="_blank" rel="noopener noreferrer">XLS-81 Permissioned DEX</a>
            <a href="https://xls.xrpl.org/xls/XLS-0096-confidential-mpt.html" target="_blank" rel="noopener noreferrer">XLS-96 Confidential MPT</a>
            <a href="https://github.com/XRPLF" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <div className="lp-footer-legal">
            Built on the XRP Ledger · Devnet / Testnet only unless connected to mainnet ·
            Not financial advice.
          </div>
        </div>
      </footer>

    </div>
  )
}
