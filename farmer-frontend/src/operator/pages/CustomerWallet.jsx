import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet } from '../../shared/lib/api.js'
import { pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { CustomerWalletDetail } from './WalletManagement.jsx'

const TOPUP_ALLOWED_STATES = new Set([
  WEEK_STATES.SETUP,
  WEEK_STATES.OPEN,
  WEEK_STATES.LOCKED,
  WEEK_STATES.DELIVERY,
  WEEK_STATES.MARKET_DAY,
])

export default function CustomerWallet () {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang } = useLang()

  const [customerName, setCustomerName] = useState(location.state?.customerName ?? '')
  const [currentState, setCurrentState] = useState(null)
  const [activeWeekId, setActiveWeekId] = useState(null)
  const [weekLoading, setWeekLoading] = useState(true)
  const [toastKey, setToastKey] = useState(null)

  const loadContext = useCallback(async () => {
    setWeekLoading(true)
    try {
      const [weeksData, customersData] = await Promise.all([
        apiGet('/api/v1/weeks'),
        location.state?.customerName
          ? Promise.resolve(null)
          : apiGet('/api/v1/customers?active=true').catch(() => null),
      ])

      const active = pickActiveWeek(weeksData.weeks ?? [])
      setActiveWeekId(active?.weekId ?? active?.week_id ?? null)
      setCurrentState(active?.state ?? null)

      if (!location.state?.customerName && customersData) {
        const found = (customersData.customers ?? []).find((c) => c.customerId === customerId)
        if (found?.name) setCustomerName(found.name)
      }
    } finally {
      setWeekLoading(false)
    }
  }, [customerId, location.state?.customerName])

  useEffect(() => {
    loadContext()
  }, [loadContext])

  useEffect(() => {
    if (!toastKey) return undefined
    const timer = setTimeout(() => setToastKey(null), 4000)
    return () => clearTimeout(timer)
  }, [toastKey])

  const topUpAllowed = currentState != null && TOPUP_ALLOWED_STATES.has(currentState)

  if (weekLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[--color-background] p-4 pb-24">
      <CustomerWalletDetail
        customerId={customerId}
        customerName={customerName}
        currentState={currentState}
        activeWeekId={activeWeekId}
        topUpAllowed={topUpAllowed}
        t={t}
        lang={lang}
        onBack={() => navigate(-1)}
        onToast={setToastKey}
      />

      {toastKey && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[--color-border] bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-[--color-text-primary]">{t(toastKey)}</p>
        </div>
      )}
    </div>
  )
}
