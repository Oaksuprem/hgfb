import { useState } from 'react'
import { useXrpl } from '../context/XrplContext'
import { DeskLayout } from '../issue/productForms'
import { BorrowerDesk, BrokerDesk, LenderDesk } from '../issue/creditForms'
import { creditAmendmentNote } from '../lib/credit'

const ROLES = [
  { id: 'broker', label: 'Loan broker' },
  { id: 'lender', label: 'Lender' },
  { id: 'borrower', label: 'Borrower' },
]

const DESK_KEY = 'hgfb-credit-desk'

const DESK_FIELDS = ['domainId', 'vaultId', 'shareId', 'brokerId', 'loanId']

function deskIds(record) {
  const next = { domainId: '', vaultId: '', shareId: '', brokerId: '', loanId: '' }
  for (const key of DESK_FIELDS) {
    if (typeof record?.[key] === 'string') next[key] = record[key]
  }
  return next
}

function recallDesk() {
  try {
    return deskIds(JSON.parse(sessionStorage.getItem(DESK_KEY) || '{}'))
  } catch {
    return deskIds(null)
  }
}

export default function CreditPage() {
  const { featureEnabled } = useXrpl()
  const [role, setRole] = useState('broker')
  const [ids, setIds] = useState(recallDesk)
  const note = creditAmendmentNote({
    vault: featureEnabled('SingleAssetVault'),
    lending: featureEnabled('LendingProtocol'),
    v11: featureEnabled('LendingProtocolV1_1'),
  })

  const save = (patch) => {
    setIds(prev => {
      const next = deskIds({ ...prev, ...patch })
      try { sessionStorage.setItem(DESK_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  return (
    <DeskLayout
      kicker="Credit"
      title="Institutional credit."
      lede="A loan broker pools one asset in a private vault, posts first-loss capital, and the borrower co-signs an uncollateralized loan. Lenders deposit and redeem shares. Nothing is sent until you submit."
      products={ROLES}
      active={role}
      onChange={setRole}
    >
      <div className={`alert alert-${note.tone}`} data-credit-note={note.tone} style={{ marginBottom: 12 }}>{note.text}</div>
      <div hidden={role !== 'broker'}>
        <BrokerDesk ids={ids} save={save} v11Enabled={featureEnabled('LendingProtocolV1_1')} />
      </div>
      <div hidden={role !== 'lender'}>
        <LenderDesk ids={ids} />
      </div>
      <div hidden={role !== 'borrower'}>
        <BorrowerDesk ids={ids} save={save} />
      </div>
    </DeskLayout>
  )
}
