import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import useWeekState from '../../shared/hooks/useWeekState.js'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'

// ─── CUSTOMER ORDER CARD ─────────────────────────────────────────────────────

function CustomerOrderCard ({ customer, onMarkPacked, packingId }) {
  const { t } = useLang()

  return (
    <div className="bg-white border border-[#E8E4DF] rounded-lg shadow-sm p-4">
      <p className="font-semibold text-base mb-3">{customer.customerName}</p>

      {customer.orders.map((order) => {
        const isPacked = order.status === 'packed'

        return (
          <div
            key={order.orderId}
            className={`rounded-md p-3 mb-2 last:mb-0 ${isPacked ? 'bg-[#F7F5F2]' : ''}`}
          >
            {/* Line items */}
            <div className="flex flex-col gap-1.5 mb-3">
              {order.lineItems.map((item) => {
                const name = item.nameEn
                const hasShortfall = item.allocatedQty < item.orderedQty
                const hasRank = item.fcfsRank !== null && item.fcfsRank !== undefined

                return (
                  <div
                    key={item.productId}
                    className={`flex items-center justify-between text-sm ${isPacked ? 'text-gray-400' : 'text-gray-800'}`}
                  >
                    {/* Item name + rank badge */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                      {hasRank && (
                        <span className="bg-amber-100 text-amber-700 text-xs rounded px-1 shrink-0">
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
                          <span className="line-through text-xs text-gray-400">{item.orderedQty}</span>
                          <span>{item.unit}</span>
                          <span className="bg-red-100 text-red-700 text-xs rounded px-1">
                            {t('packing.shortfall_badge')}
                          </span>
                        </>
                      ) : (
                        <span>{item.allocatedQty} {item.unit}</span>
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
                className="w-full min-h-[48px] bg-[#2D5A1B] text-white rounded-md flex items-center justify-center font-medium text-sm disabled:opacity-60 transition-opacity"
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
              <div className="flex items-center gap-2 text-gray-400 mt-1">
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
      className={`min-h-[44px] rounded-full border border-[#2D5A1B] text-sm px-4 py-2 transition-colors ${
        showUnpackedOnly
          ? 'bg-[#2D5A1B] text-white'
          : 'bg-white text-[#2D5A1B]'
      }`}
    >
      {showUnpackedOnly ? t('filter.show_all') : t('filter.unpacked_only')}
    </button>
  )
}

// ─── PACKING LIST PAGE ───────────────────────────────────────────────────────

export default function PackingList () {
  const { t } = useLang()
  const { week, state: weekState, loading: weekLoading } = useWeekState()

  const [customers, setCustomers] = useState([])
  const [packingId, setPackingId] = useState(null)
  const [packError, setPackError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [showUnpackedOnly, setShowUnpackedOnly] = useState(false)

  const weekId = week?.weekId

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
    if (weekState === WEEK_STATES.DELIVERY && weekId) {
      fetchPackingList()
    }
  }, [weekState, weekId, fetchPackingList])

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
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  // ── State gate ──────────────────────────────────────────────────────────────
  if (weekState !== WEEK_STATES.DELIVERY) {
    return (
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <p className="text-center text-gray-600 mt-8">
          {t('packing.not_available_in_state')}
        </p>
      </div>
    )
  }

  // ── Data loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
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
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
        <div className="mb-4">
          <StateMachineBadge state={weekState} />
        </div>
        <p className="text-center text-red-600 mt-8">{loadError}</p>
      </div>
    )
  }

  // ── Normal render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
      {/* Header: badge + title + unpacked count */}
      <div className="mb-1">
        <StateMachineBadge state={weekState} />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-lg font-semibold text-gray-900">
          {t('nav.volunteer.packing_list')}
        </h1>
        {unpackedCount > 0 && (
          <span className="bg-[#2D5A1B] text-white text-xs font-semibold rounded-full px-2 py-0.5">
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
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          {packError}
        </div>
      )}

      {/* All-packed empty state */}
      {showUnpackedOnly && unpackedCount === 0 && customers.length > 0 ? (
        <div className="flex flex-col items-center justify-center mt-16 gap-3 text-green-600">
          <CheckCircle2 size={48} strokeWidth={1.5} />
          <p className="text-gray-600 text-center">{t('packing.all_packed')}</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        /* No orders at all */
        <p className="text-center text-gray-500 mt-8">{t('empty.packing_list')}</p>
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
