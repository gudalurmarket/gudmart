import { useState, useEffect, useCallback } from 'react'
import { Search, X, CheckCircle2 } from 'lucide-react'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import { formatINR } from '../../shared/lib/paise.js'
import useWeekState from '../../shared/hooks/useWeekState.js'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'

// ─── SEARCH BAR ───────────────────────────────────────────────────────────────

function SearchBar ({ value, onChange }) {
  const { t } = useLang()

  return (
    <div className="relative flex items-center">
      <Search
        size={18}
        strokeWidth={1.5}
        className="absolute left-3 text-[--color-text-disabled] pointer-events-none"
      />
      <input
        type="search"
        inputMode="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('dispatch.search_placeholder')}
        className="w-full min-h-[44px] rounded-lg border border-[--color-border] bg-[--color-surface] pl-9 pr-10 text-sm text-[--color-text-primary] placeholder:text-[--color-text-disabled] focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30"
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 flex items-center justify-center min-h-[44px] min-w-[44px] text-[--color-text-disabled]"
          aria-label="Clear search"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

// ─── DISPATCH ORDER CARD ──────────────────────────────────────────────────────

function DispatchOrderCard ({ order, onMarkDispatched, dispatchingId }) {
  const { t } = useLang()
  const isDispatched = order.status === 'dispatched'
  const isThisDispatching = dispatchingId === order.orderId
  const anyDispatching = dispatchingId !== null

  if (isDispatched) {
    return (
      <div className="bg-[--color-surface-raised] border border-[--color-border] rounded-lg shadow-sm p-4">
        <p className="font-semibold text-base text-[--color-text-disabled] mb-2">
          {order.customerName}
        </p>
        <div className="flex items-center gap-2 text-[--color-text-disabled]">
          <CheckCircle2 size={18} strokeWidth={1.5} />
          <span className="text-sm">{t('status.dispatched')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[--color-surface] border border-[--color-border] rounded-lg shadow-sm p-4">
      <p className="font-semibold text-base text-[--color-text-primary] mb-3">
        {order.customerName}
      </p>

      {/* Line items */}
      <div className="flex flex-col gap-1.5 mb-3">
        {order.lineItems.map((item) => (
          <div
            key={item.productId}
            className="flex items-center justify-between text-sm text-[--color-text-secondary]"
          >
            <span>{item.nameEn}</span>
            <span className="shrink-0 ml-2 text-[--color-text-secondary]">
              {item.deliveredQty} {item.unit}
            </span>
          </div>
        ))}
      </div>

      {/* Balance due row — only when > 0 */}
      {order.balanceDue > 0 && (
        <div className="mb-3 rounded-md bg-[--color-warning-light] border border-[--color-warning-light] px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[--color-text-secondary]">
              {t('dispatch.balance_due_label')}
            </span>
            <span className="text-sm font-semibold text-[--color-warning]">
              {formatINR(order.balanceDue)}
            </span>
          </div>
          <p className="text-xs text-[--color-warning] mt-0.5">
            {t('dispatch.direct_to_operator')}
          </p>
        </div>
      )}

      {/* Mark Dispatched button */}
      <button
        onClick={() => onMarkDispatched(order.orderId)}
        disabled={anyDispatching}
        className="w-full min-h-[48px] bg-[--color-primary] text-[--color-text-inverse] rounded-lg flex items-center justify-center font-medium text-sm disabled:opacity-60 transition-opacity"
      >
        {isThisDispatching ? (
          <LoadingSpinner size="sm" label="" />
        ) : (
          t('action.mark_dispatched')
        )}
      </button>
    </div>
  )
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────

function SectionHeader ({ label }) {
  return (
    <div className="text-xs font-semibold text-[--color-text-secondary] uppercase tracking-wide py-2">
      {label}
    </div>
  )
}

// ─── DISPATCH PAGE ────────────────────────────────────────────────────────────

export default function Dispatch () {
  const { t } = useLang()
  const { week, state: weekState, loading: weekLoading } = useWeekState()

  const [orders, setOrders] = useState([])
  const [dispatchingId, setDispatchingId] = useState(null)
  const [dispatchError, setDispatchError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const weekId = week?.weekId

  const fetchDispatchList = useCallback(async () => {
    if (!weekId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await apiGet(`/api/v1/weeks/${weekId}/dispatch`)
      setOrders(data.orders ?? [])
    } catch {
      setLoadError(t('error.network_error'))
    } finally {
      setIsLoading(false)
    }
  }, [weekId, t])

  useEffect(() => {
    if (weekState === WEEK_STATES.MARKET_DAY && weekId) {
      fetchDispatchList()
    }
  }, [weekState, weekId, fetchDispatchList])

  const handleMarkDispatched = useCallback(
    async (orderId) => {
      if (dispatchingId !== null) return
      setDispatchingId(orderId)
      setDispatchError(null)
      try {
        await apiPatch(`/api/v1/weeks/${weekId}/orders/${orderId}/dispatched`, {})
        setOrders((prev) =>
          prev.map((o) =>
            o.orderId === orderId ? { ...o, status: 'dispatched' } : o
          )
        )
        setDispatchingId(null)
      } catch {
        setDispatchError(t('error.unknown'))
        setDispatchingId(null)
      }
    },
    [dispatchingId, weekId, t]
  )

  // ── Derived lists ────────────────────────────────────────────────────────────

  const filtered = orders.filter((o) =>
    o.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const packedOrders = filtered
    .filter((o) => o.status === 'packed')
    .sort((a, b) => a.customerName.localeCompare(b.customerName))

  const dispatchedOrders = filtered
    .filter((o) => o.status === 'dispatched')
    .sort((a, b) => a.customerName.localeCompare(b.customerName))

  const remainingCount = orders.filter((o) => o.status === 'packed').length

  // ── Loading week state ───────────────────────────────────────────────────────
  if (weekLoading) {
    return (
      <div className="min-h-full bg-[--color-background] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  // ── State gate ───────────────────────────────────────────────────────────────
  if (weekState !== WEEK_STATES.MARKET_DAY) {
    return (
      <div className="min-h-full bg-[--color-background] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <p className="text-center text-[--color-text-secondary] mt-8">
          {t('dispatch.not_available_in_state')}
        </p>
      </div>
    )
  }

  // ── Data loading ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-full bg-[--color-background] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  // ── Load error ───────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="min-h-full bg-[--color-background] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <p className="text-center text-[--color-error] mt-8">{loadError}</p>
      </div>
    )
  }

  // ── Normal render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[--color-background] px-4 py-6">
      {/* Header: badge + title + remaining badge */}
      <div className="mb-1">
        <StateMachineBadge state={weekState} />
      </div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-lg font-semibold text-[--color-text-primary]">
          {t('nav.volunteer.dispatch')}
        </h1>
        {remainingCount > 0 ? (
          <span className="bg-[--color-primary] text-[--color-text-inverse] text-xs font-semibold rounded-full px-2 py-0.5">
            {t('dispatch.remaining_count').replace('{count}', remainingCount)}
          </span>
        ) : orders.length > 0 ? (
          <span className="text-sm font-medium text-[--color-success]">
            {t('dispatch.all_dispatched')}
          </span>
        ) : null}
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Dispatch error banner */}
      {dispatchError && (
        <div className="mb-4 bg-[--color-error-light] border border-[--color-error-light] text-[--color-error] rounded-md px-4 py-3 text-sm">
          {dispatchError}
        </div>
      )}

      {/* Empty state — no orders at all */}
      {orders.length === 0 && (
        <p className="text-center text-[--color-text-secondary] mt-8">
          {t('empty.dispatch_list')}
        </p>
      )}

      {/* Empty state — search returned nothing */}
      {orders.length > 0 && filtered.length === 0 && (
        <p className="text-center text-[--color-text-secondary] mt-8">
          {t('dispatch.no_results')}
        </p>
      )}

      {/* Order lists */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Pending section */}
          {packedOrders.length > 0 && (
            <>
              <SectionHeader label={t('dispatch.section_pending')} />
              {packedOrders.map((order) => (
                <DispatchOrderCard
                  key={order.orderId}
                  order={order}
                  onMarkDispatched={handleMarkDispatched}
                  dispatchingId={dispatchingId}
                />
              ))}
            </>
          )}

          {/* Completed section */}
          {dispatchedOrders.length > 0 && (
            <>
              <SectionHeader label={t('dispatch.section_completed')} />
              {dispatchedOrders.map((order) => (
                <DispatchOrderCard
                  key={order.orderId}
                  order={order}
                  onMarkDispatched={handleMarkDispatched}
                  dispatchingId={dispatchingId}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
