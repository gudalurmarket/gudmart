import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import useVolunteerWeek from '../hooks/useVolunteerWeek.js'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'

// ─── CUSTOMER ORDER CARD ─────────────────────────────────────────────────────

function CustomerOrderCard ({ customer, onMarkPacked, packingId }) {
  const { t, lang } = useLang()

  return (
    <div className="bg-[--color-surface] border border-[--color-border] rounded-lg shadow-sm p-4">
      <p className="font-semibold text-base mb-3">{customer.customerName}</p>

      {customer.orders.map((order) => {
        const isPacked = order.status === 'packed'

        return (
          <div
            key={order.orderId}
            className={`rounded-md p-3 mb-2 last:mb-0 ${isPacked ? 'bg-[--color-surface-raised]' : ''}`}
          >
            {/* Line items */}
            <div className="flex flex-col gap-1.5 mb-3">
              {order.lineItems.map((item) => {
                const name = lang === 'ta' && item.nameTa ? item.nameTa : (item.nameEn ?? item.productId)
                const deliveredQty = item.deliveredQty ?? item.allocatedQty
                const hasShortfall = item.allocatedQty < item.orderedQty
                const hasRank = item.fcfsRank !== null && item.fcfsRank !== undefined

                return (
                  <div
                    key={item.productId}
                    className={`flex items-center justify-between text-sm ${isPacked ? 'text-[--color-text-disabled]' : 'text-[--color-text-primary]'}`}
                  >
                    {/* Item name + rank badge */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                      {hasRank && (
                        <span className="bg-[--color-warning-light] text-[--color-warning] text-xs rounded px-1 shrink-0">
                          {t('packing.fcfs_rank_prefix')}{item.fcfsRank}
                        </span>
                      )}
                      <span className="truncate">{name}</span>
                    </div>

                    {/* Qty display */}
                    <div className="flex items-center gap-1 shrink-0">
                      {hasShortfall ? (
                        <>
                          <span className="font-bold">{item.allocatedQty}</span>
                          <span className="line-through text-xs text-[--color-text-disabled]">{item.orderedQty}</span>
                          <span>{item.unit}</span>
                          <span className="bg-[--color-error-light] text-[--color-error] text-xs rounded px-1">
                            {t('packing.shortfall_badge')}
                          </span>
                        </>
                      ) : (
                        <span>{deliveredQty} {item.unit}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Mark Packed button */}
            {order.status === 'confirmed' && (
              <button
                onClick={() => onMarkPacked(order.orderId)}
                disabled={packingId !== null}
                className="w-full min-h-[48px] bg-[--color-primary] text-[--color-text-inverse] rounded-md flex items-center justify-center font-medium text-sm disabled:opacity-60 transition-opacity"
              >
                {packingId === order.orderId ? (
                  <LoadingSpinner size="sm" label="" />
                ) : (
                  t('action.mark_packed')
                )}
              </button>
            )}

            {/* Packed indicator */}
            {isPacked && (
              <div className="flex items-center gap-2 text-[--color-text-disabled] mt-1">
                <CheckCircle2 size={18} strokeWidth={1.5} />
                <span className="text-sm">{t('status.packed')}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── FILTER TOGGLE ───────────────────────────────────────────────────────────

function FilterToggle ({ showUnpackedOnly, onChange }) {
  const { t } = useLang()

  return (
    <button
      onClick={() => onChange(!showUnpackedOnly)}
      className={`min-h-[44px] rounded-full border border-[--color-primary] text-sm px-4 py-2 transition-colors ${
        showUnpackedOnly
          ? 'bg-[--color-primary] text-[--color-text-inverse]'
          : 'bg-[--color-surface] text-[--color-primary]'
      }`}
    >
      {showUnpackedOnly ? t('filter.show_all') : t('filter.unpacked_only')}
    </button>
  )
}

// ─── PACKING LIST PAGE ───────────────────────────────────────────────────────

export default function PackingList () {
  const { t } = useLang()
  const {
    weekId,
    state: weekState,
    loading: weekLoading,
    errorKey: weekErrorKey,
  } = useVolunteerWeek(WEEK_STATES.DELIVERY)

  const [customers, setCustomers] = useState([])
  const [packingId, setPackingId] = useState(null)
  const [packError, setPackError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [showUnpackedOnly, setShowUnpackedOnly] = useState(false)

  const fetchPackingList = useCallback(async () => {
    if (!weekId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await apiGet(`/api/v1/weeks/${weekId}/packing`)
      setCustomers(data.customers ?? [])
    } catch {
      setLoadError(t('error.network_error'))
    } finally {
      setIsLoading(false)
    }
  }, [weekId, t])

  useEffect(() => {
    if (weekId) {
      fetchPackingList()
    } else {
      setCustomers([])
    }
  }, [weekId, fetchPackingList])

  const handleMarkPacked = useCallback(async (orderId) => {
    if (packingId !== null) return
    setPackingId(orderId)
    setPackError(null)
    try {
      await apiPatch(`/api/v1/weeks/${weekId}/orders/${orderId}/packed`, {})
      setCustomers((prev) =>
        prev.map((customer) => ({
          ...customer,
          orders: customer.orders.map((order) =>
            order.orderId === orderId ? { ...order, status: 'packed' } : order
          ),
        }))
      )
      setPackingId(null)
    } catch {
      setPackError(t('error.unknown'))
      setPackingId(null)
    }
  }, [packingId, weekId, t])

  const unpackedCount = customers.reduce(
    (sum, c) => sum + c.orders.filter((o) => o.status === 'confirmed').length,
    0
  )

  const filteredCustomers = showUnpackedOnly
    ? customers.filter((c) => c.orders.some((o) => o.status === 'confirmed'))
    : customers

  // ── Loading week state ──────────────────────────────────────────────────────
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

  if (weekErrorKey) {
    return (
      <div className="min-h-full bg-[--color-background] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <p className="text-center text-[--color-error] mt-8">{t(weekErrorKey)}</p>
      </div>
    )
  }

  if (!weekId) {
    return (
      <div className="min-h-full bg-[--color-background] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <p className="text-center text-[--color-text-secondary] mt-8">
          {t('packing.not_available_in_state')}
        </p>
      </div>
    )
  }

  // ── Data loading ────────────────────────────────────────────────────────────
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

  // ── Load error ──────────────────────────────────────────────────────────────
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

  // ── Normal render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[--color-background] px-4 py-6">
      {/* Header: badge + title + unpacked count */}
      <div className="mb-1">
        <StateMachineBadge state={weekState} />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-lg font-semibold text-[--color-text-primary]">
          {t('nav.volunteer.packing_list')}
        </h1>
        {unpackedCount > 0 && (
          <span className="bg-[--color-primary] text-[--color-text-inverse] text-xs font-semibold rounded-full px-2 py-0.5">
            {unpackedCount}
          </span>
        )}
      </div>

      {/* Filter toggle */}
      <div className="mb-4">
        <FilterToggle showUnpackedOnly={showUnpackedOnly} onChange={setShowUnpackedOnly} />
      </div>

      {/* Pack error banner */}
      {packError && (
        <div className="mb-4 bg-[--color-error-light] border border-[--color-error-light] text-[--color-error] rounded-md px-4 py-3 text-sm">
          {packError}
        </div>
      )}

      {/* All-packed empty state */}
      {showUnpackedOnly && unpackedCount === 0 && customers.length > 0 ? (
        <div className="flex flex-col items-center justify-center mt-16 gap-3 text-[--color-success]">
          <CheckCircle2 size={48} strokeWidth={1.5} />
          <p className="text-[--color-text-secondary] text-center">{t('packing.all_packed')}</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <p className="text-center text-[--color-text-secondary] mt-8">{t('empty.no_items')}</p>
      ) : (
        /* Customer order cards */
        <div className="flex flex-col gap-3">
          {filteredCustomers.map((customer) => (
            <CustomerOrderCard
              key={customer.customerId}
              customer={customer}
              onMarkPacked={handleMarkPacked}
              packingId={packingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
