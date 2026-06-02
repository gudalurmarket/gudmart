import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarPlus, ChevronRight } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import useSSE from '../../shared/hooks/useSSE.js'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { ORDER_STATUS, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'
import CreateWeekForm from '../components/CreateWeekForm.jsx'
import { notifyActiveWeekChanged } from '../../shared/hooks/useWeekState.js'

// ─── State transition config (all states) ────────────────────────────────────

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

// ─── Blocker routing ──────────────────────────────────────────────────────────

const BLOCKER_ROUTE_MAP = {
  PENDING_PAYMENT: '/operator/orders?filter=pending_payment',
  EMPTY_PRODUCE_LIST: '/operator/setup',
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

// ─── Zone 3 CTA config per state ──────────────────────────────────────────────

const ZONE3_CONFIG = {
  [WEEK_STATES.SETUP]: {
    primaryIsTransition: true,
    primaryLabelKey: 'transition.setup_to_open.button',
    secondaryLinks: [
      { labelKey: 'dashboard.cta.edit_produce_list', route: '/operator/setup' },
    ],
  },
  [WEEK_STATES.OPEN]: {
    primaryLabelKey: 'dashboard.cta.review_intake_queue',
    primaryRoute: '/operator/intake',
    secondaryLinks: [
      { labelKey: 'dashboard.cta.view_orders', route: '/operator/orders' },
      { labelKey: 'dashboard.cta.manage_wallets', route: '/operator/wallet' },
    ],
    transitionKey: 'transition.open_to_locked.button',
  },
  [WEEK_STATES.LOCKED]: {
    primaryLabelKey: 'dashboard.cta.set_farmer_assignments',
    primaryRoute: '/operator/delivery',
    secondaryLinks: [
      { labelKey: 'dashboard.cta.view_order_summary', route: '/operator/orders' },
    ],
    transitionKey: 'transition.locked_to_delivery.button',
  },
  [WEEK_STATES.DELIVERY]: {
    primaryLabelKey: 'dashboard.cta.record_deliveries',
    primaryRoute: '/operator/delivery',
    secondaryLinks: [
      { labelKey: 'dashboard.cta.view_packing_list', route: '/operator/delivery' },
    ],
    transitionKey: 'transition.delivery_to_market_day.button',
  },
  [WEEK_STATES.MARKET_DAY]: {
    primaryLabelKey: 'dashboard.cta.record_walkin_sale',
    primaryRoute: '/operator/market-day',
    secondaryLinks: [
      { labelKey: 'dashboard.cta.view_packing_list', route: '/operator/delivery' },
    ],
    transitionKey: 'transition.market_day_to_reconciliation.button',
  },
  [WEEK_STATES.RECONCILIATION]: {
    primaryLabelKey: 'dashboard.cta.resolve_price_diffs',
    primaryRoute: '/operator/reconciliation',
    secondaryLinks: [
      { labelKey: 'dashboard.cta.record_farmer_payments', route: '/operator/reconciliation' },
    ],
    transitionKey: 'transition.reconciliation_to_closed.button',
  },
  [WEEK_STATES.CLOSED]: {
    primaryLabelKey: 'dashboard.cta.view_financial_summary',
    primaryRoute: '/operator/summary',
    secondaryLinks: [],
  },
}

// ─── State-specific stat fetcher ──────────────────────────────────────────────

async function loadStateSpecificStats (weekId, state) {
  if (state === WEEK_STATES.SETUP) {
    const [produceResult, customersResult] = await Promise.allSettled([
      apiGet(`/api/v1/weeks/${weekId}/produce`),
      apiGet('/api/v1/customers'),
    ])
    return {
      produceCount: produceResult.status === 'fulfilled'
        ? (produceResult.value.items ?? []).length
        : null,
      customerCount: customersResult.status === 'fulfilled'
        ? (customersResult.value.customers ?? []).length
        : null,
    }
  }

  if (state === WEEK_STATES.OPEN) {
    const [intakeResult, ordersResult] = await Promise.allSettled([
      apiGet(`/api/v1/weeks/${weekId}/intake?queueStatus=pending`),
      apiGet(`/api/v1/weeks/${weekId}/orders`),
    ])
    const messages = intakeResult.status === 'fulfilled'
      ? (intakeResult.value.messages ?? [])
      : null
    const orders = ordersResult.status === 'fulfilled'
      ? (ordersResult.value.orders ?? [])
      : null
    return {
      pendingIntakeCount: messages !== null ? messages.length : null,
      confirmedOrderCount: orders !== null
        ? orders.filter(o => o.status === ORDER_STATUS.CONFIRMED).length
        : null,
      pendingPaymentCount: orders !== null
        ? orders.filter(o => o.status === ORDER_STATUS.PENDING_PAYMENT).length
        : null,
    }
  }

  if (state === WEEK_STATES.LOCKED) {
    const [ordersResult, deliveryResult] = await Promise.allSettled([
      apiGet(`/api/v1/weeks/${weekId}/orders`),
      apiGet(`/api/v1/weeks/${weekId}/delivery`),
    ])
    const orders = ordersResult.status === 'fulfilled'
      ? (ordersResult.value.orders ?? [])
      : null
    const deliveryData = deliveryResult.status === 'fulfilled'
      ? deliveryResult.value
      : null
    const confirmedOrders = orders
      ? orders.filter(o => o.status === ORDER_STATUS.CONFIRMED)
      : null
    const totalOrderValue = confirmedOrders
      ? confirmedOrders.reduce((sum, o) => sum + (o.orderValue ?? o.order_value ?? 0), 0)
      : null
    const assignments = deliveryData ? (deliveryData.assignments ?? []) : null
    return {
      confirmedOrderCount: confirmedOrders !== null ? confirmedOrders.length : null,
      totalOrderValue,
      assignmentsSet: assignments !== null ? assignments.length > 0 : null,
    }
  }

  if (state === WEEK_STATES.DELIVERY) {
    const [deliveryResult] = await Promise.allSettled([
      apiGet(`/api/v1/weeks/${weekId}/delivery`),
    ])
    const deliveryData = deliveryResult.status === 'fulfilled' ? deliveryResult.value : null
    const assignments = deliveryData ? (deliveryData.assignments ?? []) : null
    if (assignments === null) return { deliveriesRecorded: null, deliveriesOutstanding: null }
    const recorded = assignments.filter(a => a.deliveredQty != null).length
    return {
      deliveriesRecorded: recorded,
      deliveriesOutstanding: assignments.length - recorded,
    }
  }

  if (state === WEEK_STATES.MARKET_DAY) {
    const [walkinResult] = await Promise.allSettled([
      apiGet(`/api/v1/weeks/${weekId}/walkin`),
    ])
    const walkinData = walkinResult.status === 'fulfilled' ? walkinResult.value : null
    const sales = walkinData ? (walkinData.sales ?? []) : null
    if (sales === null) return { walkinCount: null, walkinTotal: null }
    return {
      walkinCount: sales.length,
      walkinTotal: sales.reduce((sum, s) => sum + (s.amountCollected ?? 0), 0),
    }
  }

  if (state === WEEK_STATES.RECONCILIATION) {
    const [reconResult, paymentsResult] = await Promise.allSettled([
      apiGet(`/api/v1/weeks/${weekId}/reconciliation`),
      apiGet(`/api/v1/weeks/${weekId}/farmerpayments`),
    ])
    const reconData = reconResult.status === 'fulfilled' ? reconResult.value : null
    const paymentsData = paymentsResult.status === 'fulfilled' ? paymentsResult.value : null
    const priceDiffs = reconData ? (reconData.priceDifferences ?? []) : null
    const payments = paymentsData ? (paymentsData.payments ?? []) : null
    return {
      priceDiffsUnresolved: priceDiffs !== null
        ? priceDiffs.filter(d => !d.differenceConfirmed).length
        : null,
      farmerPaymentsUnpaid: payments !== null
        ? payments.filter(p => p.status === 'unpaid').length
        : null,
    }
  }

  return {}
}

// ─── Stat card definitions per state ──────────────────────────────────────────

function buildStatCards (state, stats, t) {
  const fmt = v => (v != null ? String(v) : '--')

  switch (state) {
    case WEEK_STATES.SETUP:
      return [
        { labelKey: 'dashboard.stat.produce_items', value: fmt(stats.produceCount) },
        { labelKey: 'dashboard.stat.registered_customers', value: fmt(stats.customerCount) },
      ]
    case WEEK_STATES.OPEN:
      return [
        { labelKey: 'dashboard.stat.intake_pending', value: fmt(stats.pendingIntakeCount) },
        { labelKey: 'dashboard.stat.confirmed_orders', value: fmt(stats.confirmedOrderCount) },
        { labelKey: 'dashboard.stat.pending_payment', value: fmt(stats.pendingPaymentCount) },
      ]
    case WEEK_STATES.LOCKED:
      return [
        { labelKey: 'dashboard.stat.confirmed_orders', value: fmt(stats.confirmedOrderCount) },
        {
          labelKey: 'dashboard.stat.total_order_value',
          value: stats.totalOrderValue != null ? formatINR(stats.totalOrderValue) : '--',
        },
        {
          labelKey: 'dashboard.stat.farmer_assignments',
          value: stats.assignmentsSet != null
            ? t(stats.assignmentsSet
              ? 'dashboard.stat.assignments_complete'
              : 'dashboard.stat.assignments_pending')
            : '--',
        },
      ]
    case WEEK_STATES.DELIVERY:
      return [
        { labelKey: 'dashboard.stat.deliveries_recorded', value: fmt(stats.deliveriesRecorded) },
        { labelKey: 'dashboard.stat.deliveries_outstanding', value: fmt(stats.deliveriesOutstanding) },
      ]
    case WEEK_STATES.MARKET_DAY:
      return [
        { labelKey: 'dashboard.stat.walkin_count', value: fmt(stats.walkinCount) },
        {
          labelKey: 'dashboard.stat.walkin_total',
          value: stats.walkinTotal != null ? formatINR(stats.walkinTotal) : '--',
        },
      ]
    case WEEK_STATES.RECONCILIATION:
      return [
        { labelKey: 'dashboard.stat.price_diffs_unresolved', value: fmt(stats.priceDiffsUnresolved) },
        { labelKey: 'dashboard.stat.farmer_payments_unpaid', value: fmt(stats.farmerPaymentsUnpaid) },
      ]
    default:
      return []
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard ({ label, value }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 shadow-sm">
      <p className="text-sm text-[--color-text-secondary]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[--color-text-primary]">{value}</p>
    </div>
  )
}

function SkeletonCard () {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-surface] p-4 shadow-sm">
      <div className="h-4 w-24 animate-pulse rounded bg-[--color-border]" />
      <div className="mt-2 h-8 w-16 animate-pulse rounded bg-[--color-border]" />
    </div>
  )
}

function CreateWeekModal ({ open, onClose, onCreated, t }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-week-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[--color-border] bg-[--color-surface] p-6 shadow-xl">
        <h2 id="create-week-title" className="text-lg font-semibold text-[--color-text-primary]">
          {t('dashboard.no_active_week.create_button')}
        </h2>
        <p className="mt-1 text-sm text-[--color-text-secondary]">{t('dashboard.no_active_week.body')}</p>
        <div className="mt-4">
          <CreateWeekForm onCreated={onCreated} onCancel={onClose} t={t} />
        </div>
      </div>
    </div>
  )
}

function ConfirmModal ({ open, title, body, onCancel, onConfirm, loading, cancelLabel, confirmLabel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[--color-border] bg-[--color-surface] p-6">
        <h2 className="text-lg font-semibold text-[--color-text-primary]">{title}</h2>
        <p className="mt-2 text-sm text-[--color-text-secondary]">{body}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary px-4 py-2 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn-primary px-4 py-2 disabled:opacity-60"
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
    <section className="mt-2">
      <h3 className="mb-2 text-sm font-semibold text-[--color-text-primary]">
        {t('dashboard.blockers.header')}
      </h3>
      {blockers.map((blocker, index) => {
        const blockerType = blocker?.type ?? 'UNKNOWN'
        const blockerKey = BLOCKER_KEY_MAP[blockerType]
        const route = BLOCKER_ROUTE_MAP[blockerType]
        const identifier =
          blocker?.orderId ?? blocker?.order_id ?? blocker?.farmerId ?? blocker?.farmer_id ?? null
        return (
          <button
            key={`${blockerType}-${index}`}
            type="button"
            onClick={() => route && navigate(route)}
            className="mb-2 flex w-full cursor-pointer items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3 text-left hover:bg-[--color-surface-raised]"
            style={{ borderLeftWidth: '4px', borderLeftColor: 'var(--color-warning)' }}
          >
            <AlertCircle size={18} strokeWidth={1.5} className="shrink-0 text-[--color-warning]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[--color-text-primary]">
                {t(blockerKey ?? 'error.transition_gate_blocked')}
              </p>
              {identifier && (
                <p className="text-sm text-[--color-text-secondary]">{identifier}</p>
              )}
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[--color-text-secondary]" />
          </button>
        )
      })}
    </section>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Dashboard () {
  const navigate = useNavigate()
  const { lang, t } = useLang()

  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  const [toastKey, setToastKey] = useState(null)
  const [stats, setStats] = useState({})
  const [week, setWeek] = useState(null)
  const [blockers, setBlockers] = useState([])
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCreateWeekModal, setShowCreateWeekModal] = useState(false)
  const [transitionLoading, setTransitionLoading] = useState(false)

  const weekId = resolveWeekId(week)
  const currentState = week?.state ?? null

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setStatsLoading(true)
    setErrorKey(null)
    try {
      const weeksData = await apiGet('/api/v1/weeks')
      const weeks = weeksData.weeks ?? []
      const activeWeek = pickActiveWeek(weeks)

      if (!activeWeek) {
        setWeek(null)
        setStats({})
        setBlockers([])
        return
      }

      const activeWeekId = resolveWeekId(activeWeek)
      if (!activeWeekId) {
        setWeek(null)
        setStats({})
        setBlockers([])
        return
      }

      const weekState = activeWeek.state

      const [weekData, stateStats] = await Promise.all([
        apiGet(`/api/v1/weeks/${activeWeekId}`),
        loadStateSpecificStats(activeWeekId, weekState),
      ])

      const weekDetails = weekData.week ?? weekData
      setWeek(weekDetails)
      setStats(stateStats)
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
    } finally {
      setLoading(false)
      setStatsLoading(false)
    }
  }, [])

  const handleSSEMessage = useCallback(() => {
    loadDashboard(true)
  }, [loadDashboard])

  useSSE({ weekId, onNewMessage: handleSSEMessage })

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (!toastKey) return undefined
    const timer = setTimeout(() => setToastKey(null), 4000)
    return () => clearTimeout(timer)
  }, [toastKey])

  const transitionMeta = useMemo(() => TRANSITION_CONFIG[currentState] ?? null, [currentState])
  const formattedMarketDate = formatMarketDate(week?.marketDate ?? week?.market_date, lang)

  const handleTransitionConfirm = async () => {
    if (!transitionMeta || !weekId) return
    setTransitionLoading(true)
    try {
      await apiPatch(`/api/v1/weeks/${weekId}/state`, { targetState: transitionMeta.targetState })
      setShowConfirmModal(false)
      setBlockers([])
      notifyActiveWeekChanged()
      await loadDashboard()
      setToastKey('toast.week_state_changed')
    } catch (err) {
      const errBlockers = err?.details?.blockers ?? err?.blockers ?? null
      if (errBlockers && errBlockers.length > 0) {
        setShowConfirmModal(false)
        setBlockers(errBlockers)
        return
      }
      setShowConfirmModal(false)
      setToastKey(apiErrorTranslationKey(err))
    } finally {
      setTransitionLoading(false)
    }
  }

  // ── Render: initial full-page loading
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // ── Render: error state
  if (errorKey) {
    return (
      <div className="bg-[--color-background] px-4 py-6">
        <div className="mx-auto max-w-2xl rounded-lg border border-[--color-border] bg-[--color-surface] p-4">
          <p className="text-sm text-[--color-error]">{t(errorKey)}</p>
        </div>
      </div>
    )
  }

  // ── Render: no active week
  if (!week || !weekId) {
    return (
      <div className="bg-[--color-background] px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-[--color-border] bg-[--color-surface] p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[--color-surface-raised]">
              <CalendarPlus size={40} strokeWidth={1.5} className="text-[--color-primary]" />
            </div>
            <h2 className="text-lg font-semibold text-[--color-text-primary]">
              {t('dashboard.no_active_week.title')}
            </h2>
            <p className="mt-2 text-sm text-[--color-text-secondary]">
              {t('dashboard.no_active_week.body')}
            </p>
            <button
              type="button"
              onClick={() => setShowCreateWeekModal(true)}
              className="btn-primary mt-5 w-full"
            >
              {t('dashboard.no_active_week.create_button')}
            </button>
          </div>
        </div>

        <CreateWeekModal
          open={showCreateWeekModal}
          onClose={() => setShowCreateWeekModal(false)}
          onCreated={async () => {
            setShowCreateWeekModal(false)
            notifyActiveWeekChanged()
            await loadDashboard()
            setToastKey('toast.week_created')
          }}
          t={t}
        />
      </div>
    )
  }

  const statCards = buildStatCards(currentState, stats, t)
  const zone3 = ZONE3_CONFIG[currentState]
  const transitionFrom = currentState
  const transitionTo = transitionMeta?.targetState

  return (
    <div className="bg-[--color-background] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Zone 1 — Week identity bar */}
        <div className="flex items-center justify-between gap-3">
          <StateMachineBadge state={currentState} />
          <p className="text-sm font-medium text-[--color-text-secondary]">{formattedMarketDate}</p>
        </div>

        {/* Zone 2 — State-contextual stat row */}
        {statCards.length > 0 && (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {statsLoading
              ? Array.from({ length: statCards.length }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <SkeletonCard key={i} />
                ))
              : statCards.map(({ labelKey, value }) => (
                  <StatCard key={labelKey} label={t(labelKey)} value={value} />
                ))}
          </section>
        )}

        {/* Zone 3 — Primary CTA + contextual actions */}
        {zone3 && (
          <section className="space-y-3">
            {zone3.primaryIsTransition ? (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={transitionLoading}
                className="btn-primary w-full min-h-[40px] disabled:opacity-60"
              >
                {transitionLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[--color-text-inverse]/80 border-t-transparent" />
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {t(zone3.primaryLabelKey)}
                    <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(zone3.primaryRoute)}
                className="btn-primary w-full min-h-[40px]"
              >
                <span className="inline-flex items-center gap-2">
                  {t(zone3.primaryLabelKey)}
                  <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
                </span>
              </button>
            )}

            {zone3.secondaryLinks.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {zone3.secondaryLinks.map(link => (
                  <button
                    key={`${link.route}|${link.labelKey}`}
                    type="button"
                    onClick={() => navigate(link.route)}
                    className="text-sm text-[--color-primary] hover:underline"
                  >
                    {t(link.labelKey)}
                  </button>
                ))}
              </div>
            )}

            {zone3.transitionKey && transitionMeta && (
              <div className="border-t border-[--color-border] pt-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={transitionLoading}
                  className="w-full rounded-lg border border-[--color-primary] px-4 py-2.5 text-sm font-semibold text-[--color-primary] transition-colors hover:bg-[--color-primary] hover:text-[--color-text-inverse] disabled:opacity-60 min-h-[44px]"
                >
                  {transitionLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[--color-primary] border-t-transparent inline-block" />
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {t(zone3.transitionKey)}
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Blockers */}
        <BlockerList blockers={blockers} t={t} navigate={navigate} />
      </div>

      {/* Toast */}
      {toastKey && (
        <div className="fixed bottom-6 right-6 z-40 rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3 shadow-lg">
          <p className="text-sm text-[--color-text-primary]">{t(toastKey)}</p>
        </div>
      )}

      {/* Confirm modal — state transitions */}
      <ConfirmModal
        open={showConfirmModal && transitionMeta !== null}
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
