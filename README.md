# XRPL Client — HGFB Hell's Gate

A comprehensive XRP Ledger client application enabling institutional-grade trading, confidential tokens, and full protocol feature support.

**Transact at the speed of thought.** Trade global assets, issue tokenized securities, and move value across borders in under 4 seconds — with compliance built in.

---

## Features

### 🏦 **Core Banking**
- **Account Management** — Generate new accounts via faucet or import from seed
- **Payments** — Send XRP and issued tokens with destination tags and memos
- **Trust Lines** — Open and manage token trust relationships
- **Transaction History** — Real-time tx tracking with on-chain validation

### 📈 **Trading & Liquidity**
- **DEX (Decentralized Exchange)** — Place, manage, and cancel order-book offers
- **AMM (Automated Market Makers)** — Create pools, deposit/withdraw liquidity, vote on fees, bid for auction slots
- **Permissioned DEX** ⚡ *NEW* — Credential-gated trading environments (XLS-81)
  - Issue and manage credentials (CredentialCreate/Accept/Delete)
  - Create permissioned domains with accepted credential allow-lists
  - Place open, permissioned, or hybrid offers
  - Enforced at protocol level — no third-party intermediary required

### 🔐 **Confidential Tokens** ⚡ *NEW*
Full XLS-96 workflow for EC-ElGamal encrypted MPT balances:
- **Issue** — Create MPTs with `tfMPTCanHoldConfidentialBalance`
- **Key Registration** — Derive encryption keypairs and register issuer/auditor keys
- **Convert & Merge** — Public → confidential balance → spending balance
- **Selective Disclosure** — Issuers and auditors can decrypt any balance; holders see only their own
- **Privacy + Compliance** — Full holder privacy with institutional oversight

### 🪙 **Token Issuance**
- **Fungible Tokens (FT)** — Configure issuer settings, distribute tokens, authorize holders, clawback
- **NFTs (XLS-20)** — Mint, create offers (buy/sell), accept, cancel, burn
- **Multi-Purpose Tokens (MPT / XLS-33)** — Low-overhead tokens with transfer controls

### 🔒 **Advanced Features**
- **Multi-Signature** — M-of-N approval workflows with signer list management
- **Fee Sponsorship** — Delegated transaction fees for gasless user experience
- **Price Oracles (XLS-47)** — Publish and query on-chain price feeds with aggregation
- **One-Click PWA Install** — Progressive Web App with offline support

---

## Tech Stack

- **React 19** — Latest React with concurrent features
- **xrpl.js v5.1** — Official XRP Ledger JavaScript SDK
- **Vite 8** — Lightning-fast build tooling
- **React Router 7** — Client-side routing
- **PWA** — Installable progressive web app with service worker
- **No UI framework** — Custom design system with CSS variables

---

## Getting Started

### Prerequisites
- Node.js 18+ (for running locally)
- Modern browser with ES2020 support

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

---

## Networks

The app supports three XRP Ledger networks:

| Network  | WebSocket URL                           | Use Case                          |
|----------|-----------------------------------------|-----------------------------------|
| Devnet   | `wss://s.devnet.rippletest.net:51233`  | Latest amendments (Permissioned DEX, Confidential Tokens) |
| Testnet  | `wss://s.altnet.rippletest.net:51233`  | Stable test environment           |
| Mainnet  | `wss://xrplcluster.com`                | ⚠ Real XRP — use with caution     |

Switch networks in the top navigation bar.

---

## Key Pages

| Route                     | Feature                                                |
|---------------------------|--------------------------------------------------------|
| `/`                       | **Landing Page** — Hero, features, use cases, CTA      |
| `/account`                | Bank — Wallet management and account setup             |
| `/send`                   | Pay — XRP and token payments                           |
| `/trustlines`             | Assets — Trust line management                         |
| `/dex`                    | Invest — Order book DEX and AMM                        |
| `/permissioned-dex`       | **Permissioned DEX** — Credential-gated trading        |
| `/confidential-tokens`    | **Confidential Tokens** — Encrypted MPT balances       |
| `/issue`                  | Issue — FT, NFT, and MPT token issuance                |
| `/multisign`              | Multi-sign — M-of-N transaction approval               |
| `/sponsor`                | Sponsor — Fee delegation workflows                     |
| `/oracle`                 | Oracle — On-chain price feeds (XLS-47)                 |

---

## Amendment Requirements

Some features require specific amendments enabled on the network:

| Feature               | Amendments Required                                  | Availability       |
|-----------------------|------------------------------------------------------|--------------------|
| Permissioned DEX      | `PermissionedDEX` + `PermissionedDomains` + `Credentials` | Devnet only (as of Dec 2024) |
| Confidential Tokens   | `ConfidentialTransfer`                               | Devnet only (as of Dec 2024) |
| AMM                   | `AMM`                                                | All networks       |
| MPT                   | `MPT` (XLS-33)                                       | All networks       |
| Oracles               | `PriceOracle` (XLS-47)                               | All networks       |

Transactions requiring unavailable amendments will fail gracefully with an error message.

---

## Design Philosophy

**Compliance-native**: Permissioned DEX and confidential tokens are protocol-level features — not bolted-on layers. Credentials, domain access, and selective auditor disclosure are enforced by the ledger itself.

**Self-custodial**: Your seed never leaves your browser. All signing happens client-side using `xrpl.Wallet`. For production, integrate with hardware wallets or enterprise key management.

**No abstractions**: Direct transaction construction using `xrpl.js` — you see exactly what goes on-chain. Every field is exposed, every flag is documented.

**Modular & extensible**: Each page is a standalone feature. Add new transaction types by following the existing pattern: `ensureConnected()` → build tx → `submitAndWait()` → handle result.

---

## Security Notes

- **Testnet/Devnet only by default**: The app connects to devnet on first load. Switch to mainnet manually and **use at your own risk**.
- **Seeds in sessionStorage**: Wallet seeds are stored in plain text in `sessionStorage` (cleared on tab close). Not suitable for production without encryption.
- **No external wallet support**: This is a developer reference client. For end-user applications, integrate Xaman, Crossmark, or GemWallet.
- **Encryption keys**: EC-ElGamal private keys are derived from account seeds. Back up seeds securely — lost keys mean permanently unspendable confidential balances.

---

## Project Structure

```
src/
├── components/       # Reusable UI: Navbar, WalletCard, TxModal, TxHistory
├── context/          # XrplContext — global state, WebSocket client, tx history
├── hooks/            # useMultisign — multi-sig transaction logic
├── lib/              # Helpers: network config, tx formatting
├── pages/            # Feature pages (AccountPage, DexPage, PermissionedDexPage, etc.)
│   ├── LandingPage.jsx              ⚡ NEW — Marketing hero + features
│   ├── PermissionedDexPage.jsx      ⚡ NEW — XLS-81 credential-gated trading
│   └── ConfidentialTokensPage.jsx   ⚡ NEW — XLS-96 encrypted MPT balances
├── issue/            # Separate Issue app entry point
├── App.jsx           # Routing shell
├── main.jsx          # React root + PWA registration
└── index.css         # Design system + landing/feature-specific styles
```

---

## Contributing

This is a reference implementation showcasing XRP Ledger protocol features. Contributions welcome:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## Resources

- [XRP Ledger Documentation](https://xrpl.org)
- [xrpl.js Library](https://js.xrpl.org)
- [XLS-81: Permissioned DEX](https://xls.xrpl.org/xls/XLS-0081-permissioned-dex.html)
- [XLS-96: Confidential Transfers for MPTs](https://xls.xrpl.org/xls/XLS-0096-confidential-mpt.html)
- [XLS-33: Multi-Purpose Tokens](https://github.com/XRPLF/XRPL-Standards/discussions/282)
- [XLS-47: Price Oracles](https://github.com/XRPLF/XRPL-Standards/discussions/302)

---

## License

MIT

---

**Built on the XRP Ledger · HGFB / Hell's Gate**

*Transact at the speed of thought.*
