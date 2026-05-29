import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Scale,
  CalendarPlus,
  ChevronRight,
  FileText,
  MessageSquare,
  ShoppingCart,
  Store,
  Truck,
  Wallet,
} from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import useSSE from '../../shared/hooks/useSSE.js'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { ORDER_STATUS, SSE_STATUS, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'

const TRANSITION_CONFIG = {
  [WEEK_STATES.SETUP]: {
    labelKey: 'transition.setup_to_open.button',
    targetState: WEEK_STATES.OPEN,
  },
  [WEEK_STATES.OPEN]: {
    labelKey: 'transition.open_to_locked.button',
    targetState: WEEK_STATES.LOCKED,
  },
  [WEEK_STATES.LOCKED]: {
    labelKey: 'transition.locked_to_delivery.button',
    targetState: WEEK_STATES.DELIVERY,
  },
  [WEEK_STATES.DELIVERY]: {
    labelKey: 'transition.delivery_to_market_day.button',
    targetState: WEEK_STATES.MARKET_DAY,
  },
  [WEEK_STATES.MARKET_DAY]: {
    labelKey: 'transition.market_day_to_reconciliation.button',
    targetState: WEEK_STATES.RECONCILIATION,
  },
  [WEEK_STATES.RECONCILIATION]: {
    labelKey: 'transition.reconciliation_to_closed.button',
    targetState: WEEK_STATES.CLOSED,
  },
}

const BLOCKER_ROUTE_MAP = {
  PENDING_PAYMENT: '/operator/orders?filter=pending_payment',
  EMPTY_PRODUCE_LIST: '/operator/week-setup',
  UNCONFIRMED_PRICE_DIFFERENCES: '/operator/reconciliation',
  UNPAID_FARMER_ASSIGNMENTS: '/operator/reconciliation',
  UNRECORDED_LOCAL_PAYMENTS: '/operator/reconciliation',
}

const BLOCKER_KEY_MAP = {
  PENDING_PAYMENT: 'blocker.pending_payment_orders',
  EMPTY_PRODUCE_LIST: 'blocker.empty_produce_list',
  UNCONFIRMED_PRICE_DIFFERENCES: 'blocker.unconfirmed_price_differences',
  UNPAID_FARMER_ASSIGNMENTS: 'blocker.unpaid_farmer_assignments',
  UNRECORDED_LOCAL_PAYMENTS: 'blocker.unrecorded_local_payments',
}

function translateWithFallback (t, primaryKey, fallbackKey) {
  const primary = t(primaryKey)
  if (primary !== primaryKey) return primary
  return fallbackKey ? t(fallbackKey) : primary
}

function getSSEMeta (status) {
  if (status === SSE_STATUS.CONNECTED) {
    return { key: 'sse.status.connected', dotClass: 'bg-green-600' }
  }
  if (status === SSE_STATUS.RECONNECTING) {
    return { key: 'sse.status.reconnecting', dotClass: 'bg-amber-500' }
  }
  return { key: 'sse.status.polling', fallbackKey: 'sse.status.polling_fallback', dotClass: 'bg-gray-500' }
}

function getBlockerIdentifier (blocker) {
  if (!blocker || typeof blocker !== 'object') return null
  return blocker.orderId
    ?? blocker.order_id
    ?? blocker.farmerId
    ?? blocker.farmer_id
    ?? blocker.customerId
    ?? blocker.customer_id
    ?? blocker.itemId
    ?? blocker.item_id
    ?? null
}

function DashboardStatCard ({ label, value, onClick, badgeCount }) {
  return (
    <button
      type="button"
      role="button"
      onClick={onClick}
      className="w-full cursor-pointer rounded-xl border border-[#E8E4DF] bg-white p-4 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500">{label}</p>
        {badgeCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            {badgeCount}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold text-[#2D5A1B]">{value}</p>
    </button>
  )
}

function ConfirmModal ({ open, title, body, onCancel, onConfirm, loading, cancelLabel, confirmLabel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-2 text-gray-600 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-[#2D5A1B] px-4 py-2 text-white disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function BlockerList ({ blockers, t, navigate }) {
  if (!blockers.length) return null

  return (
    <section className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{t('dashboard.blockers.header')}</h3>
      {blockers.map((blocker, index) => {
        const blockerType = blocker?.type ?? 'UNKNOWN'
        const blockerKey = BLOCKER_KEY_MAP[blockerType]
        const route = BLOCKER_ROUTE_MAP[blockerType]
        const identifier = getBlockerIdentifier(blocker)
        return (
          <button
            key={`${blockerType}-${index}`}
            type="button"
            onClick={() => route && navigate(route)}
            className="mb-2 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-left hover:bg-amber-50"
          >
            <AlertCircle size={18} strokeWidth={1.5} className="shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800">{t(blockerKey ?? 'error.transition_gate_blocked')}</p>
              {identifier && <p className="text-sm text-gray-500">{identifier}</p>}
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-gray-500" />
          </button>
        )
      })}
    </section>
  )
}

export default function Dashboard () {
  const navigate = useNavigate()
  const { lang, t } = useLang()

  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState(null)
  const [toastKey, setToastKey] = useState(null)
  const [stats, setStats] = useState({
    pendingIntakeCount: 0,
    confirmedOrderCount: 0,
    pendingPaymentCount: 0,
  })
  const [week, setWeek] = useState(null)
  const [blockers, setBlockers] = useState([])
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [transitionLoading, setTransitionLoading] = useState(false)

  const weekId = resolveWeekId(week)
  const currentState = week?.state ?? null

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setErrorKey(null)
    try {
      const weeksData = await apiGet('/api/v1/weeks')
      const weeks = weeksData.weeks ?? []
      const activeWeek = pickActiveWeek(weeks)

      if (!activeWeek) {
        setWeek(null)
        setStats({
          pendingIntakeCount: 0,
          confirmedOrderCount: 0,
          pendingPaymentCount: 0,
        })
        setBlockers([])
        return
      }

      const activeWeekId = resolveWeekId(activeWeek)
      if (!activeWeekId) {
        setWeek(null)
        setStats({
          pendingIntakeCount: 0,
          confirmedOrderCount: 0,
          pendingPaymentCount: 0,
        })
        setBlockers([])
        return
      }
      const [weekData, intakeData, ordersData] = await Promise.all([
        apiGet(`/api/v1/weeks/${activeWeekId}`),
        apiGet(`/api/v1/weeks/${activeWeekId}/intake?queueStatus=pending`),
        apiGet(`/api/v1/weeks/${activeWeekId}/orders`),
      ])

      const weekDetails = weekData.week ?? weekData
      const messages = intakeData.messages ?? []
      const orders = ordersData.orders ?? []
      const confirmedOrderCount = orders.filter((order) => order.status === ORDER_STATUS.CONFIRMED).length
      const pendingPaymentCount = orders.filter((order) => order.status === ORDER_STATUS.PENDING_PAYMENT).length

      setWeek(weekDetails)
      setStats({
        pendingIntakeCount: messages.length,
        confirmedOrderCount,
        pendingPaymentCount,
      })
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSSEMessage = useCallback(() => {
    loadDashboard()
  }, [loadDashboard])

  const { status: sseStatus } = useSSE({
    weekId,
    onNewMessage: handleSSEMessage,
  })

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (!toastKey) return undefined
    const timer = setTimeout(() => setToastKey(null), 4000)
    return () => clearTimeout(timer)
  }, [toastKey])

  const transitionMeta = useMemo(() => TRANSITION_CONFIG[currentState] ?? null, [currentState])
  const sseMeta = getSSEMeta(sseStatus)
  const formattedMarketDate = formatMarketDate(week?.marketDate ?? week?.market_date, lang)
  const openingCash = typeof week?.openingBalanceCash === 'number' ? formatINR(week.openingBalanceCash) : null
  const openingBank = typeof week?.openingBalanceBank === 'number' ? formatINR(week.openingBalanceBank) : null

  const handleTransitionConfirm = async () => {
    if (!transitionMeta || !weekId) return
    setTransitionLoading(true)
    try {
      await apiPatch(`/api/v1/weeks/${weekId}/state`, { targetState: transitionMeta.targetState })
      setShowConfirmModal(false)
      setBlockers([])
      await loadDashboard()
      setToastKey('toast.week_state_changed')
    } catch (err) {
      const blockers =
        err?.details?.blockers ??
        err?.blockers ??
        null

      if (blockers && blockers.length > 0) {
        setShowConfirmModal(false)
        setBlockers(blockers)
        return
      }
      setShowConfirmModal(false)
      setToastKey(apiErrorTranslationKey(err))
    } finally {
      setTransitionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#F0EDE8]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (errorKey) {
    return (
      <div className="bg-[#F0EDE8] px-4 py-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-white p-4">
          <p className="text-sm text-red-700">{t(errorKey)}</p>
        </div>
      </div>
    )
  }

  if (!week || !weekId) {
    return (
      <div className="bg-[#F0EDE8] px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-[#E8E4DF] bg-white p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F0EDE8]">
              <CalendarPlus size={40} strokeWidth={1.5} className="text-[#2D5A1B]" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.no_active_week.title')}</h2>
            <p className="mt-2 text-sm text-gray-600">{t('dashboard.no_active_week.body')}</p>
            <button
              type="button"
              onClick={() => navigate('/operator/week-setup')}
              className="mt-5 w-full rounded-xl bg-[#2D5A1B] px-6 py-4 text-base font-medium text-white"
            >
              {t('dashboard.no_active_week.create_button')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const navTiles = [
    {
      key: 'nav.order_intake',
      fallbackKey: null,
      route: '/operator/intake',
      icon: MessageSquare,
      visible: currentState === WEEK_STATES.OPEN,
    },
    {
      key: 'nav.orders',
      fallbackKey: 'nav.order_management',
      route: '/operator/orders',
      icon: ShoppingCart,
      visible: true,
    },
    {
      key: 'nav.wallet',
      fallbackKey: 'nav.wallet_management',
      route: '/operator/wallet',
      icon: Wallet,
      visible: true,
    },
    {
      key: 'nav.delivery',
      fallbackKey: 'nav.delivery_management',
      route: '/operator/delivery',
      icon: Truck,
      visible: true,
    },
    {
      key: 'nav.market_day',
      fallbackKey: null,
      route: '/operator/market-day',
      icon: Store,
      visible: true,
    },
    {
      key: 'nav.reconciliation',
      fallbackKey: null,
      route: '/operator/reconciliation',
      icon: Scale,
      visible: true,
    },
    {
      key: 'nav.weekly_summary',
      fallbackKey: null,
      route: '/operator/summary',
      icon: FileText,
      visible: currentState === WEEK_STATES.CLOSED,
    },
  ]

  const transitionFrom = currentState
  const transitionTo = transitionMeta?.targetState

  return (
    <div className="bg-[#F0EDE8] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <StateMachineBadge state={currentState} />
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${sseMeta.dotClass}`} />
              <p className="text-xs text-gray-600">
                {translateWithFallback(t, sseMeta.key, sseMeta.fallbackKey)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{formattedMarketDate}</p>
            {openingCash != null && openingBank != null && (
              <p className="mt-1 text-xs text-gray-500">
                {t('summary.cash_label')}: {openingCash} | {t('summary.bank_label')}: {openingBank}
              </p>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {currentState === WEEK_STATES.OPEN && (
            <DashboardStatCard
              label={t('dashboard.stat.intake_pending')}
              value={stats.pendingIntakeCount}
              onClick={() => navigate('/operator/intake')}
            />
          )}
          <DashboardStatCard
            label={t('dashboard.stat.confirmed_orders')}
            value={stats.confirmedOrderCount}
            onClick={() => navigate('/operator/orders')}
          />
          <DashboardStatCard
            label={t('dashboard.stat.pending_payment')}
            value={stats.pendingPaymentCount}
            badgeCount={stats.pendingPaymentCount}
            onClick={() => navigate('/operator/orders?filter=pending_payment')}
          />
        </section>

        {transitionMeta && (
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={transitionLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D5A1B] px-6 py-4 text-base font-medium text-white disabled:opacity-60"
          >
            {transitionLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
            ) : (
              <>
                <span>{t(transitionMeta.labelKey)}</span>
                <ArrowRight size={18} strokeWidth={1.5} />
              </>
            )}
          </button>
        )}

        <BlockerList blockers={blockers} t={t} navigate={navigate} />

        <section className="grid grid-cols-2 gap-3">
          {navTiles.filter((tile) => tile.visible).map((tile) => {
            const Icon = tile.icon
            return (
              <button
                key={tile.route}
                type="button"
                onClick={() => navigate(tile.route)}
                className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-[#E8E4DF] bg-white p-4 transition-shadow hover:shadow-md"
              >
                <Icon size={20} strokeWidth={1.5} className="text-[#2D5A1B]" />
                <span className="text-sm font-medium text-gray-700">
                  {translateWithFallback(t, tile.key, tile.fallbackKey)}
                </span>
              </button>
            )
          })}
        </section>
      </div>

      {toastKey && (
        <div className="fixed bottom-6 right-6 z-40 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-sm text-gray-800">{t(toastKey)}</p>
        </div>
      )}

      <ConfirmModal
        open={showConfirmModal}
        title={t(`transition.${transitionFrom}_to_${transitionTo}.confirm_title`)}
        body={t(`transition.${transitionFrom}_to_${transitionTo}.confirm_body`)}
        loading={transitionLoading}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={handleTransitionConfirm}
        cancelLabel={t('action.cancel')}
        confirmLabel={t('action.confirm')}
      />
    </div>
  )
}
