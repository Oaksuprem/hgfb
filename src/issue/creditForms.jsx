/**
 * Credit-desk forms. Each card submits one transaction, and only after the button press.
 */
import { useEffect, useState } from 'react'
import { useXrpl } from '../context/XrplContext'
import TxModal from '../components/TxModal'
import {
  buildCoverDeposit,
  buildCoverWithdraw,
  buildLoanBrokerSet,
  buildLoanPay,
  buildLoanSet,
  buildVaultCreate,
  buildVaultDeposit,
  buildVaultWithdraw,
  closedVaultRefusal,
  createdLedgerIndex,
  loanSetReadyToCountersign,
  readSignedLoanSet,
} from '../lib/credit.js'
import { LSF_ACCEPTED, acceptBlockReason, buildKybAccept, buildKybCredential, findCredential } from '../services/CredentialService.js'
import { buildCreditDomain } from '../services/DomainService.js'

const LOAN_KEY = 'hgfb-credit-loanset'

function useCard() {
  const ctx = useXrpl()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [txResult, setTxResult] = useState(null)

  async function run(work) {
    if (!ctx.wallet) { setError('Open a book first — Bank tab.'); return }
    setLoading(true)
    setError('')
    setInfo('')
    setTxResult(null)
    try {
      const send = async (tx, { type, signed = false }) => {
        const client = await ctx.ensureConnected()
        const result = signed
          ? await client.submitAndWait(tx)
          : await client.submitAndWait(tx, { wallet: ctx.xrpl.Wallet.fromSeed(ctx.wallet.seed) })
        setTxResult(result)
        const code = result.result.meta.TransactionResult
        const ok = code === 'tesSUCCESS'
        ctx.addTx({ type, status: ok ? 'success' : 'error', hash: result.result.hash })
        if (!ok) throw new Error(`${type} did not clear: ${code}`)
        return result
      }
      await work({ ...ctx, send, setInfo })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return { ...ctx, loading, error, info, txResult, setTxResult, run }
}

function useSuggested(suggested) {
  const [value, setValue] = useState(suggested || '')
  useEffect(() => {
    if (suggested) setValue(suggested)
  }, [suggested])
  return [value, setValue]
}

function Card({ title, lede, error, info, children, txResult, onClose }) {
  return (
    <div className="glass-card">
      <div className="section-title">{title}</div>
      {lede && <p className="muted">{lede}</p>}
      {error && <div className="alert alert-danger">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}
      {children}
      {txResult && <TxModal tx={txResult} onClose={onClose} />}
    </div>
  )
}

function assetInput(asset) {
  return {
    kind: asset.kind,
    currency: asset.currency,
    issuer: asset.issuer,
    mptIssuanceId: asset.mptIssuanceId,
  }
}

function SendButton({ pending, pendingLabel = 'Sending…', disabled, children, name, onClick, full = true, secondary = false }) {
  const tone = secondary ? 'btn btn-secondary' : 'btn btn-primary'
  return (
    <button
      type="button"
      className={tone + (full ? ' btn-full' : '')}
      data-action={name}
      onClick={onClick}
      disabled={disabled || pending}
    >
      {pending ? <><span className="spinner"></span> {pendingLabel}</> : children}
    </button>
  )
}

function AssetFields({ asset, amount, setAmount, amountLabel = 'Amount', name }) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label>Asset</label>
          <select data-field={`${name}-kind`} value={asset.kind} onChange={e => asset.setKind(e.target.value)}>
            <option value="xrp">XRP</option>
            <option value="iou">Issued currency</option>
            <option value="mpt">Multi-purpose token</option>
          </select>
        </div>
        {setAmount && (
          <div className="field">
            <label>{amountLabel}</label>
            <input data-field={`${name}-amount`} type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        )}
      </div>
      {asset.kind === 'iou' && (
        <div className="field-row">
          <div className="field">
            <label>Currency</label>
            <input data-field={`${name}-currency`} value={asset.currency} onChange={e => asset.setCurrency(e.target.value)} />
          </div>
          <div className="field">
            <label>Issuer</label>
            <input data-field={`${name}-issuer`} value={asset.issuer} onChange={e => asset.setIssuer(e.target.value)} placeholder="r…" />
          </div>
        </div>
      )}
      {asset.kind === 'mpt' && (
        <div className="field">
          <label>MPT issuance ID</label>
          <input data-field={`${name}-mpt`} className="mono" value={asset.mptIssuanceId} onChange={e => asset.setMptIssuanceId(e.target.value)} placeholder="64-character hex" />
        </div>
      )}
    </>
  )
}

function useAsset() {
  const [kind, setKind] = useState('xrp')
  const [currency, setCurrency] = useState('USD')
  const [issuer, setIssuer] = useState('')
  const [mptIssuanceId, setMptIssuanceId] = useState('')
  return { kind, setKind, currency, setCurrency, issuer, setIssuer, mptIssuanceId, setMptIssuanceId }
}

function IdField({ label, value, onChange, name }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input data-field={name} className="mono" value={value} onChange={e => onChange(e.target.value)} placeholder="64-character hex" />
    </div>
  )
}

export function BrokerDesk({ ids, save, v11Enabled }) {
  return (
    <div className="flow">
      <DomainCard onCreated={domainId => save({ domainId })} />
      <IssueCard />
      <VaultCard domainId={ids.domainId} v11Enabled={v11Enabled} onCreated={save} />
      <BrokerCard vaultId={ids.vaultId} onCreated={brokerId => save({ brokerId })} />
      <CoverCard brokerId={ids.brokerId} />
    </div>
  )
}

function DomainCard({ onCreated }) {
  const card = useCard()
  const [issuer, setIssuer] = useState('')
  const [credentialType, setCredentialType] = useState('KYB')
  const [domainId, setDomainId] = useState('')

  const create = () => card.run(async ({ wallet, send, setInfo }) => {
    const tx = buildCreditDomain({
      account: wallet.address,
      issuer: issuer.trim() || wallet.address,
      credentialType,
      domainId,
    })
    const result = await send(tx, { type: 'PermissionedDomainSet' })
    const created = createdLedgerIndex(result, 'PermissionedDomain') || domainId.trim()
    if (created) {
      setDomainId(created)
      onCreated(created)
    }
    setInfo(created ? `Domain ready. ID: ${created}` : 'Domain updated.')
  })

  return (
    <Card title="Permissioned domain" lede="Accounts need an accepted KYB credential from this issuer before they can use the private vault." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <div className="field">
        <label>Credential issuer</label>
        <input data-field="credential-issuer" value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="Blank uses the open book" />
      </div>
      <div className="field">
        <label>Credential type</label>
        <input data-field="credential-type" value={credentialType} onChange={e => setCredentialType(e.target.value)} />
      </div>
      <IdField label="Domain ID (blank creates one)" name="domain-id" value={domainId} onChange={setDomainId} />
      <SendButton name="set-domain" onClick={create} pending={card.loading} disabled={!card.wallet}>Save domain</SendButton>
    </Card>
  )
}

function IssueCard() {
  const card = useCard()
  const [subject, setSubject] = useState('')
  const [credentialType, setCredentialType] = useState('KYB')
  const [expiration, setExpiration] = useState('')

  const issue = () => card.run(async ({ wallet, send, setInfo }) => {
    const tx = buildKybCredential({
      account: wallet.address,
      subject: subject.trim(),
      credentialType: credentialType.trim(),
      expiration: expiration || undefined,
    })
    await send(tx, { type: 'CredentialCreate' })
    setInfo(`Credential “${credentialType.trim()}” is waiting for the subject to accept.`)
  })

  return (
    <Card title="Issue KYB credential" lede="The loan broker signs this. The lender or borrower accepts it on their own tab." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <div className="field">
        <label>Subject</label>
        <input data-field="subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="r…" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Credential type</label>
          <input data-field="issue-type" value={credentialType} onChange={e => setCredentialType(e.target.value)} />
        </div>
        <div className="field">
          <label>Expiry (optional)</label>
          <input data-field="expiry" type="date" value={expiration} onChange={e => setExpiration(e.target.value)} />
        </div>
      </div>
      <SendButton name="issue-credential" onClick={issue} pending={card.loading} disabled={!card.wallet}>Issue credential</SendButton>
    </Card>
  )
}

function VaultCard({ domainId, v11Enabled, onCreated }) {
  const card = useCard()
  const asset = useAsset()
  const [domain, setDomain] = useSuggested(domainId)
  const [scale, setScale] = useState('6')
  const [assetsMaximum, setAssetsMaximum] = useState('')
  const [data, setData] = useState('Credit vault')
  const [closed, setClosed] = useState(false)
  const [subscription, setSubscription] = useState('')
  const [redemption, setRedemption] = useState('')
  const [nonTransferable, setNonTransferable] = useState(false)

  const create = () => card.run(async ({ wallet, send, setInfo }) => {
    if (closed) {
      const refusal = closedVaultRefusal(v11Enabled)
      if (refusal) throw new Error(refusal)
    }
    const tx = buildVaultCreate({
      account: wallet.address,
      ...assetInput(asset),
      assetsMaximum,
      data,
      domainId: domain,
      scale: asset.kind === 'iou' ? scale : '',
      closed,
      subscription,
      redemption,
      nonTransferable,
    })
    const result = await send(tx, { type: 'VaultCreate' })
    const vaultId = createdLedgerIndex(result, 'Vault')
    const shareId = createdLedgerIndex(result, 'MPTokenIssuance')
    if (vaultId) onCreated({ vaultId, ...(shareId ? { shareId } : {}) })
    setInfo(vaultId ? `Vault created. ID: ${vaultId}` : 'Vault created.')
  })

  return (
    <Card title="Single asset vault" lede={domain.trim() ? 'A domain is set, so this vault is private. Only credentialed accounts can deposit.' : 'No domain is set, so this vault is public. Add the domain id to restrict deposits.'} error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <AssetFields name="vault" asset={asset} />
      {asset.kind === 'iou' && (
        <div className="field">
          <label>Share scale (0–18)</label>
          <input data-field="scale" type="number" min="0" max="18" value={scale} onChange={e => setScale(e.target.value)} />
        </div>
      )}
      <IdField label="Domain ID" name="vault-domain" value={domain} onChange={setDomain} />
      <div className="field">
        <label>Asset cap (blank for no cap)</label>
        <input data-field="asset-cap" value={assetsMaximum} onChange={e => setAssetsMaximum(e.target.value)} />
      </div>
      <div className="field">
        <label>Vault data</label>
        <input data-field="vault-data" value={data} onChange={e => setData(e.target.value)} />
      </div>
      <label className="flag-row">
        <input data-field="non-transferable" type="checkbox" checked={nonTransferable} onChange={e => setNonTransferable(e.target.checked)} />
        <span className="flag-label">Non-transferable shares</span>
      </label>
      <label className="flag-row">
        <input data-field="closed" type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)} />
        <span className="flag-label">Closed-ended vault</span>
        <span className="flag-hint">Requires LendingProtocolV1_1. After that amendment, a new loan broker can only use a closed-ended vault.</span>
      </label>
      {closed && (
        <div className="field-row">
          <div className="field">
            <label>Subscription ends</label>
            <input data-field="subscription" type="datetime-local" value={subscription} onChange={e => setSubscription(e.target.value)} />
          </div>
          <div className="field">
            <label>Redemption begins</label>
            <input data-field="redemption" type="datetime-local" value={redemption} onChange={e => setRedemption(e.target.value)} />
          </div>
        </div>
      )}
      <SendButton name="create-vault" onClick={create} pending={card.loading} disabled={!card.wallet}>Create vault</SendButton>
    </Card>
  )
}

function BrokerCard({ vaultId, onCreated }) {
  const card = useCard()
  const asset = useAsset()
  const [vault, setVault] = useSuggested(vaultId)
  const [managementFee, setManagementFee] = useState('0.1')
  const [coverMinimum, setCoverMinimum] = useState('10')
  const [coverLiquidation, setCoverLiquidation] = useState('5')
  const [debtMaximum, setDebtMaximum] = useState('')

  const create = () => card.run(async ({ wallet, send, setInfo }) => {
    const tx = buildLoanBrokerSet({
      account: wallet.address,
      vaultId: vault,
      managementFeePercent: managementFee,
      coverMinimumPercent: coverMinimum,
      coverLiquidationPercent: coverLiquidation,
      debtMaximum,
      ...assetInput(asset),
    })
    const result = await send(tx, { type: 'LoanBrokerSet' })
    const brokerId = createdLedgerIndex(result, 'LoanBroker')
    if (brokerId) onCreated(brokerId)
    setInfo(brokerId ? `Loan broker created. ID: ${brokerId}` : 'Loan broker created.')
  })

  return (
    <Card title="Loan broker" lede="Links this protocol to the vault. The management fee is a percent of interest, up to 10%. Cover rates are percents of debt, and both must be zero or both must be set." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <IdField label="Vault ID" name="broker-vault" value={vault} onChange={setVault} />
      <div className="field-row">
        <div className="field">
          <label>Management fee %</label>
          <input data-field="management-fee" type="text" inputMode="decimal" value={managementFee} onChange={e => setManagementFee(e.target.value)} />
        </div>
        <div className="field">
          <label>Minimum cover %</label>
          <input data-field="cover-min" type="text" inputMode="decimal" value={coverMinimum} onChange={e => setCoverMinimum(e.target.value)} />
        </div>
        <div className="field">
          <label>Liquidation cover %</label>
          <input data-field="cover-liq" type="text" inputMode="decimal" value={coverLiquidation} onChange={e => setCoverLiquidation(e.target.value)} />
        </div>
      </div>
      <AssetFields name="broker" asset={asset} />
      <div className="field">
        <label>Debt maximum (blank for no limit)</label>
        <input data-field="debt-max" value={debtMaximum} onChange={e => setDebtMaximum(e.target.value)} />
      </div>
      <SendButton name="create-broker" onClick={create} pending={card.loading} disabled={!card.wallet}>Create loan broker</SendButton>
    </Card>
  )
}

function CoverCard({ brokerId }) {
  const depositCard = useCard()
  const withdrawCard = useCard()
  const asset = useAsset()
  const [broker, setBroker] = useSuggested(brokerId)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [shown, setShown] = useState('deposit')
  const active = shown === 'withdraw' ? withdrawCard : depositCard

  const deposit = () => {
    setShown('deposit')
    depositCard.run(async ({ wallet, send, setInfo }) => {
      const tx = buildCoverDeposit({
        account: wallet.address,
        loanBrokerId: broker,
        ...assetInput(asset),
        value: depositAmount,
      })
      await send(tx, { type: 'LoanBrokerCoverDeposit' })
      setInfo('First-loss capital deposited.')
    })
  }

  const withdraw = () => {
    setShown('withdraw')
    withdrawCard.run(async ({ wallet, send, setInfo }) => {
      const tx = buildCoverWithdraw({
        account: wallet.address,
        loanBrokerId: broker,
        ...assetInput(asset),
        value: withdrawAmount,
        destination,
      })
      await send(tx, { type: 'LoanBrokerCoverWithdraw' })
      setInfo('First-loss capital withdrawn.')
    })
  }

  return (
    <Card title="First-loss capital" lede="This is the broker’s own capital. It absorbs default losses before vault depositors do. It is not the borrower’s collateral." error={active.error} info={active.info} txResult={active.txResult} onClose={() => active.setTxResult(null)}>
      <IdField label="Loan broker ID" name="cover-broker" value={broker} onChange={setBroker} />
      <AssetFields name="cover" asset={asset} />
      <div className="field-row">
        <div className="field">
          <label>Amount to deposit</label>
          <input data-field="cover-deposit-amount" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Amount to withdraw</label>
          <input data-field="cover-withdraw-amount" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Withdraw destination (blank returns it here)</label>
        <input data-field="cover-destination" value={destination} onChange={e => setDestination(e.target.value)} placeholder="r…" />
      </div>
      <div className="field-row">
        <SendButton name="deposit-cover" onClick={deposit} pending={depositCard.loading} disabled={!depositCard.wallet || withdrawCard.loading} full={false}>Deposit</SendButton>
        <SendButton name="withdraw-cover" onClick={withdraw} pending={withdrawCard.loading} disabled={!withdrawCard.wallet || depositCard.loading} full={false} secondary>Withdraw excess</SendButton>
      </div>
    </Card>
  )
}

export function LenderDesk({ ids }) {
  return (
    <div className="flow">
      <AcceptCard />
      <DepositCard vaultId={ids.vaultId} />
      <WithdrawCard vaultId={ids.vaultId} shareId={ids.shareId} />
    </div>
  )
}

function AcceptCard() {
  const card = useCard()
  const [issuer, setIssuer] = useState('')
  const [credentialType, setCredentialType] = useState('KYB')

  const accept = () => card.run(async ({ wallet, ensureConnected, send, setInfo }) => {
    const client = await ensureConnected()
    const node = await findCredential(client, {
      subject: wallet.address,
      issuer: issuer.trim(),
      credentialType: credentialType.trim(),
    })
    const reason = acceptBlockReason({
      account: wallet.address,
      issuer: issuer.trim(),
      credentialType: credentialType.trim(),
      exists: Boolean(node),
      accepted: Boolean(node && (node.Flags & LSF_ACCEPTED)),
    })
    if (reason) throw new Error(reason)
    const tx = buildKybAccept({
      account: wallet.address,
      issuer: issuer.trim(),
      credentialType: credentialType.trim(),
    })
    await send(tx, { type: 'CredentialAccept' })
    setInfo('Credential accepted.')
  })

  return (
    <Card title="Accept KYB credential" lede="The open book is the subject. The issuer is the loan broker, or the credential issuer the broker used." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <div className="field">
        <label>Issuer</label>
        <input data-field="accept-issuer" value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="r…" />
      </div>
      <div className="field">
        <label>Credential type</label>
        <input data-field="accept-type" value={credentialType} onChange={e => setCredentialType(e.target.value)} />
      </div>
      <SendButton name="accept-credential" onClick={accept} pending={card.loading} disabled={!card.wallet}>Accept credential</SendButton>
    </Card>
  )
}

function DepositCard({ vaultId }) {
  const card = useCard()
  const asset = useAsset()
  const [vault, setVault] = useSuggested(vaultId)
  const [amount, setAmount] = useState('')

  const deposit = () => card.run(async ({ wallet, send, setInfo }) => {
    const tx = buildVaultDeposit({ account: wallet.address, vaultId: vault, ...assetInput(asset), value: amount })
    await send(tx, { type: 'VaultDeposit' })
    setInfo('Assets deposited. Vault shares come back to this account.')
  })

  return (
    <Card title="Deposit" lede="The vault mints shares for this deposit. A private vault also requires the accepted credential." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <IdField label="Vault ID" name="deposit-vault" value={vault} onChange={setVault} />
      <AssetFields name="lender-deposit" asset={asset} amount={amount} setAmount={setAmount} amountLabel="Assets to deposit" />
      <SendButton name="deposit-vault" onClick={deposit} pending={card.loading} disabled={!card.wallet}>Deposit</SendButton>
    </Card>
  )
}

function WithdrawCard({ vaultId, shareId }) {
  const card = useCard()
  const asset = useAsset()
  const [vault, setVault] = useSuggested(vaultId)
  const [shares, setShares] = useSuggested(shareId)
  const [amount, setAmount] = useState('')
  const [redeemShares, setRedeemShares] = useState(false)
  const [destination, setDestination] = useState('')

  const withdraw = () => card.run(async ({ wallet, send, setInfo }) => {
    const tx = buildVaultWithdraw({
      account: wallet.address,
      vaultId: vault,
      ...assetInput(asset),
      value: amount,
      redeemShares,
      shareIssuanceId: shares,
      destination,
    })
    await send(tx, { type: 'VaultWithdraw' })
    setInfo(redeemShares ? 'Shares redeemed.' : 'Assets withdrawn.')
  })

  return (
    <Card title="Withdraw" lede="Ask for assets, or redeem a number of vault shares. Interest paid into the vault increases what each share returns." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <IdField label="Vault ID" name="withdraw-vault" value={vault} onChange={setVault} />
      <label className="flag-row">
        <input data-field="redeem-shares" type="checkbox" checked={redeemShares} onChange={e => setRedeemShares(e.target.checked)} />
        <span className="flag-label">Redeem shares instead of requesting an asset amount</span>
      </label>
      {redeemShares
        ? <IdField label="Share issuance ID" name="share-id" value={shares} onChange={setShares} />
        : <AssetFields name="lender-withdraw" asset={asset} />}
      <div className="field">
        <label>{redeemShares ? 'Shares to redeem' : 'Assets to withdraw'}</label>
        <input data-field="withdraw-amount" value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Destination (blank pays this account)</label>
        <input data-field="withdraw-destination" value={destination} onChange={e => setDestination(e.target.value)} placeholder="r…" />
      </div>
      <SendButton name="withdraw-vault" onClick={withdraw} pending={card.loading} disabled={!card.wallet}>Withdraw</SendButton>
    </Card>
  )
}

export function BorrowerDesk({ ids, save }) {
  return (
    <div className="flow">
      <AcceptCard />
      <LoanCard brokerId={ids.brokerId} onCreated={loanId => save({ loanId })} />
      <PayCard loanId={ids.loanId} />
    </div>
  )
}

function LoanCard({ brokerId, onCreated }) {
  const card = useCard()
  const asset = useAsset()
  const [broker, setBroker] = useSuggested(brokerId)
  const [counterparty, setCounterparty] = useState('')
  const [principal, setPrincipal] = useState('')
  const [interest, setInterest] = useState('0.5')
  const [payments, setPayments] = useState('12')
  const [intervalDays, setIntervalDays] = useState('30')
  const [graceDays, setGraceDays] = useState('7')
  const [originationFee, setOriginationFee] = useState('')
  const [serviceFee, setServiceFee] = useState('')
  const [allowOverpayment, setAllowOverpayment] = useState(false)
  const [step, setStep] = useState('')
  const [signedText, setSignedText] = useState(() => {
    try { return sessionStorage.getItem(LOAN_KEY) || '' } catch { return '' }
  })

  const keepSigned = (text) => {
    setSignedText(text)
    try {
      if (text) sessionStorage.setItem(LOAN_KEY, text)
      else sessionStorage.removeItem(LOAN_KEY)
    } catch { /* private mode */ }
  }

  const terms = (account) => buildLoanSet({
    account,
    counterparty,
    loanBrokerId: broker,
    ...assetInput(asset),
    principal,
    interestPercent: interest,
    paymentTotal: payments,
    paymentIntervalDays: intervalDays,
    graceDays,
    originationFee,
    serviceFee,
    allowOverpayment,
  })

  const signFirst = () => {
    setStep('sign')
    card.run(async ({ wallet, xrpl, ensureConnected, setInfo }) => {
      const tx = terms(wallet.address)
      const client = await ensureConnected()
      const prepared = await client.autofill(tx)
      const signed = xrpl.decode(xrpl.Wallet.fromSeed(wallet.seed).sign(prepared).tx_blob)
      keepSigned(JSON.stringify(signed, null, 2))
      setInfo('Signed. Open the counterparty book and submit this same loan. Nothing has been sent yet.')
    }).finally(() => setStep(''))
  }

  const countersign = () => {
    setStep('submit')
    card.run(async ({ wallet, xrpl, send, setInfo }) => {
      const signed = readSignedLoanSet(signedText)
      const reason = loanSetReadyToCountersign(signed, wallet.address)
      if (reason) throw new Error(reason)
      const full = xrpl.signLoanSetByCounterparty(xrpl.Wallet.fromSeed(wallet.seed), signed)
      const result = await send(full.tx, { type: 'LoanSet', signed: true })
      const loanId = createdLedgerIndex(result, 'Loan')
      if (loanId) onCreated(loanId)
      keepSigned('')
      setInfo(loanId ? `Loan created. ID: ${loanId}` : 'Loan created.')
    }).finally(() => setStep(''))
  }

  return (
    <Card title="Create the loan" lede="The open book signs first. The counterparty signs second and that signature is what gets submitted. The loan is uncollateralized. This desk does not add a custodian." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <IdField label="Loan broker ID" name="loan-broker" value={broker} onChange={setBroker} />
      <div className="field">
        <label>Counterparty</label>
        <input data-field="counterparty" value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="r…" />
      </div>
      <AssetFields name="loan" asset={asset} amount={principal} setAmount={setPrincipal} amountLabel="Principal" />
      <div className="field-row">
        <div className="field">
          <label>Interest % per year</label>
          <input data-field="interest" value={interest} onChange={e => setInterest(e.target.value)} />
        </div>
        <div className="field">
          <label>Payments</label>
          <input data-field="payments" value={payments} onChange={e => setPayments(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Days between payments</label>
          <input data-field="interval-days" value={intervalDays} onChange={e => setIntervalDays(e.target.value)} />
        </div>
        <div className="field">
          <label>Grace days</label>
          <input data-field="grace-days" value={graceDays} onChange={e => setGraceDays(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Origination fee</label>
          <input data-field="origination-fee" value={originationFee} onChange={e => setOriginationFee(e.target.value)} />
        </div>
        <div className="field">
          <label>Service fee per payment</label>
          <input data-field="service-fee" value={serviceFee} onChange={e => setServiceFee(e.target.value)} />
        </div>
      </div>
      <label className="flag-row">
        <input data-field="allow-overpayment" type="checkbox" checked={allowOverpayment} onChange={e => setAllowOverpayment(e.target.checked)} />
        <span className="flag-label">Allow overpayment</span>
      </label>
      <SendButton name="sign-loan" onClick={signFirst} pending={step === 'sign'} pendingLabel="Signing…" disabled={card.loading || !card.wallet} secondary>Sign first</SendButton>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Signed loan</label>
        <textarea data-field="signed-loan" rows={6} className="mono" value={signedText} onChange={e => keepSigned(e.target.value)} placeholder="The first signature appears here. The counterparty pastes it if this book was opened later." />
      </div>
      <SendButton name="countersign-loan" onClick={countersign} pending={step === 'submit'} disabled={card.loading || !card.wallet}>Countersign and submit</SendButton>
    </Card>
  )
}

function PayCard({ loanId }) {
  const card = useCard()
  const asset = useAsset()
  const [loan, setLoan] = useSuggested(loanId)
  const [amount, setAmount] = useState('')
  const [payment, setPayment] = useState('regular')

  const pay = () => card.run(async ({ wallet, send, setInfo }) => {
    const tx = buildLoanPay({
      account: wallet.address,
      loanId: loan,
      ...assetInput(asset),
      value: amount,
      payment,
    })
    await send(tx, { type: 'LoanPay' })
    setInfo('Payment sent.')
  })

  return (
    <Card title="Repay" lede="Only the borrower can pay. A late payment, an early payoff, and an overpayment are separate flags, and only one can be set." error={card.error} info={card.info} txResult={card.txResult} onClose={() => card.setTxResult(null)}>
      <IdField label="Loan ID" name="loan-id" value={loan} onChange={setLoan} />
      <AssetFields name="repay" asset={asset} amount={amount} setAmount={setAmount} amountLabel="Payment amount" />
      <div className="field">
        <label>Payment type</label>
        <select data-field="payment-type" value={payment} onChange={e => setPayment(e.target.value)}>
          <option value="regular">Regular</option>
          <option value="late">Late</option>
          <option value="full">Pay off early</option>
          <option value="overpayment">Overpayment</option>
        </select>
      </div>
      <SendButton name="pay-loan" onClick={pay} pending={card.loading} disabled={!card.wallet}>Pay</SendButton>
    </Card>
  )
}
