import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import { useLang } from '../../shared/lib/LangContext.jsx'
import useWeekState from '../../shared/hooks/useWeekState.js'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import { enqueueEntry, loadQueue, flushQueue } from '../lib/deliverySync'

// ─── SECTION 2: DELIVERY ITEM ROW ─────────────────────────────────────────

/**
 * Props:
 *   assignment   — one item from GET /delivery response
 *   lang         — 'en' | 'ta'
 *   onSave       — (assignmentId, deliveredQty: number) => void
 *   pendingQty   — number | null  (value queued in IndexedDB, not yet synced)
 *   isSaving     — boolean
 *   lastSaveError — string | null
 */
function DeliveryItemRow ({ assignment, lang, onSave, pendingQty, isSaving, lastSaveError }) {
  const { t } = useLang()
  const { assignmentId, nameEn, nameTa, unit, expectedQty, deliveredQty } = assignment

  const displayName = lang === 'ta' ? nameTa : nameEn
  const unitLabel = t(`unit.${unit}`)

  // Pre-fill: prefer pendingQty (unsynced), then server deliveredQty, else empty
  const initialVal = pendingQty != null
    ? String(pendingQty)
    : deliveredQty != null
      ? String(deliveredQty)
      : ''

  const [inputValue, setInputValue] = useState(initialVal)

  // Sync input when server or pending data changes from outside
  useEffect(() => {
    if (pendingQty != null) {
      setInputValue(String(pendingQty))
    } else if (deliveredQty != null) {
      setInputValue(String(deliveredQty))
    }
  }, [pendingQty, deliveredQty])

  function handleSubmit (e) {
    e.preventDefault()
    const parsed = parseFloat(inputValue)
    if (isNaN(parsed) || parsed < 0) return
    onSave(assignmentId, parsed)
  }

  // Variance display — only after a successful server save (deliveredQty != null)
  let varianceEl = null
  if (deliveredQty != null) {
    const diff = deliveredQty - expectedQty
    if (diff === 0) {
      varianceEl = (
        <p className="mt-2 text-sm font-medium text-green-700">
          ✓ {t('delivery.full_delivery')}
        </p>
      )
    } else if (diff < 0) {
      varianceEl = (
        <p className="mt-2 text-sm font-medium text-red-600">
          ⚠ {t('delivery.shortfall_flag')}: {Math.abs(diff)} {unitLabel}
        </p>
      )
    } else {
      varianceEl = (
        <p className="mt-2 text-sm font-medium text-amber-600">
          ↑ {t('delivery.overdelivery_flag')}: {diff} {unitLabel}
        </p>
      )
    }
  }

  return (
    <div className="bg-white border border-[#E8E4DF] rounded-lg shadow-sm p-4">
      {/* Item name + pending badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="font-semibold text-base text-gray-900 leading-tight">{displayName}</p>
        {pendingQty != null && (
          <span className="inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            {t('delivery.pending_sync')}
          </span>
        )}
      </div>

      {/* Expected qty */}
      <p className="text-sm text-gray-500 mb-3">
        {t('delivery.expected_qty_label')}:{' '}
        <span className="text-gray-800 font-medium">{expectedQty} {unitLabel}</span>
      </p>

      {/* Input + save */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label
          className="text-sm text-gray-600"
          htmlFor={`qty-${assignmentId}`}
        >
          {t('delivery.delivered_qty_label')}
        </label>
        <input
          id={`qty-${assignmentId}`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSaving}
          className="w-full rounded-lg border border-[#E8E4DF] bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D5A1B] min-h-[44px] disabled:opacity-50"
        />

        {lastSaveError && (
          <p className="text-sm text-red-600">{lastSaveError}</p>
        )}

        <button
          type="submit"
          disabled={isSaving || inputValue === ''}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#2D5A1B] text-white font-medium text-sm min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isSaving && (
            <span
              className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"
              aria-hidden="true"
            />
          )}
          {t('action.save')}
        </button>
      </form>

      {varianceEl}
    </div>
  )
}

// ─── SECTION 3: FCFS ALLOCATION PANEL ─────────────────────────────────────

/**
 * Props:
 *   allocations — array of { orderId, allocatedQty, requestedQty, unit }
 *   unit        — unit string for display
 *
 * Collapsed by default. Informational only — no actions.
 */
function AllocationPanel ({ allocations, unit }) {
  const { t } = useLang()
  const [expanded, setExpanded] = useState(false)
  const unitLabel = t(`unit.${unit}`)

  return (
    <div className="bg-white border border-[#E8E4DF] rounded-lg shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 min-h-[44px]"
      >
        <span>{t('delivery.fcfs_allocation_title')}</span>
        {expanded
          ? <ChevronUp size={16} strokeWidth={1.5} aria-hidden="true" />
          : <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
        }
      </button>

      {expanded && (
        <div className="border-t border-[#E8E4DF] px-4 pb-3">
          {allocations.map((alloc) => (
            <div
              key={alloc.orderId}
              className="flex items-center justify-between py-2 text-sm border-b border-[#F0EDE8] last:border-0"
            >
              <span className="font-mono text-gray-500">{alloc.orderId.slice(0, 8)}</span>
              <span className="text-gray-800">
                {alloc.allocatedQty}/{alloc.requestedQty} {unitLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SECTION 4: DELIVERY ENTRY PAGE ───────────────────────────────────────

export default function DeliveryEntry () {
  const { t, lang } = useLang()
  const { week, state, loading: weekLoading } = useWeekState()

  // Resolve weekId from either the normalised field or raw _id
  const weekId = week?.weekId ?? week?._id ?? null

  // ── Page state ──────────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState([])
  /** Map<assignmentId, { deliveredQty, fcfsTriggered, allocations }> */
  const [localDelivered, setLocalDelivered] = useState(new Map())
  const [savingId, setSavingId] = useState(null)
  /** Map<assignmentId, errorCode string> */
  const [saveErrors, setSaveErrors] = useState(new Map())
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  /** Map<productId, { assignmentId, deliveredQty }> — loaded from IndexedDB */
  const [pendingQueue, setPendingQueue] = useState(new Map())

  // ── Online / offline listeners ──────────────────────────────────────────
  useEffect(() => {
    function onOnline () { setIsOffline(false) }
    function onOffline () { setIsOffline(true) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // ── Fetch delivery assignments from server ──────────────────────────────
  const fetchDelivery = useCallback(async (wId) => {
    if (!wId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await apiGet(`/api/v1/weeks/${wId}/delivery`)
      setAssignments(data.assignments ?? [])
    } catch (err) {
      setLoadError(err.code ?? 'UNKNOWN')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Mount: load queue, flush if online, then fetch ──────────────────────
  useEffect(() => {
    if (!weekId) return

    async function init () {
      const queue = await loadQueue(weekId)
      setPendingQueue(queue)

      if (navigator.onLine) {
        try { await flushQueue(weekId, apiPatch) } catch { /* silent — banner already shown */ }
        const updated = await loadQueue(weekId)
        setPendingQueue(updated)
      }

      await fetchDelivery(weekId)
    }

    init()
  }, [weekId, fetchDelivery])

  // ── Reconnect: flush pending entries then re-fetch ──────────────────────
  useEffect(() => {
    if (!weekId) return

    function handleOnline () {
      async function reconnect () {
        try { await flushQueue(weekId, apiPatch) } catch { /* silent — banner already shown */ }
        const updated = await loadQueue(weekId)
        setPendingQueue(updated)
        await fetchDelivery(weekId)
      }
      reconnect()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [weekId, fetchDelivery])

  // ── Save handler ────────────────────────────────────────────────────────
  async function handleSave (assignmentId, deliveredQty) {
    if (!weekId) return
    const assignment = assignments.find((a) => a.assignmentId === assignmentId)
    if (!assignment) return

    if (isOffline) {
      await enqueueEntry(weekId, assignment.productId, assignmentId, deliveredQty)
      setPendingQueue((prev) => {
        const next = new Map(prev)
        next.set(assignment.productId, { assignmentId, deliveredQty })
        return next
      })
      // No error shown — offline banner already explains the situation
      return
    }

    setSavingId(assignmentId)
    setSaveErrors((prev) => {
      const next = new Map(prev)
      next.delete(assignmentId)
      return next
    })

    try {
      const result = await apiPatch(
        `/api/v1/weeks/${weekId}/delivery/${assignmentId}`,
        { deliveredQty },
      )
      setLocalDelivered((prev) => {
        const next = new Map(prev)
        next.set(assignmentId, {
          deliveredQty: result.deliveredQty,
          fcfsTriggered: result.fcfsTriggered,
          allocations: result.allocations ?? [],
        })
        return next
      })
      // Reflect server-confirmed qty back into the assignments array
      setAssignments((prev) =>
        prev.map((a) =>
          a.assignmentId === assignmentId
            ? { ...a, deliveredQty: result.deliveredQty }
            : a,
        ),
      )
    } catch (err) {
      setSaveErrors((prev) => {
        const next = new Map(prev)
        next.set(assignmentId, err.code ?? 'UNKNOWN')
        return next
      })
    } finally {
      setSavingId(null)
    }
  }

  // ── Shared header element (present in every render branch) ──────────────
  const headerEl = (
    <div className="flex flex-col gap-2 mb-4">
      <div>
        <StateMachineBadge state={state} />
      </div>
      <h1 className="text-lg font-semibold text-gray-900">
        {t('nav.volunteer.delivery_entry')}
      </h1>
    </div>
  )

  // ── Loading ─────────────────────────────────────────────────────────────
  if (weekLoading || (isLoading && assignments.length === 0)) {
    return (
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
        {headerEl}
        <div className="flex justify-center mt-12">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  // ── Load error ───────────────────────────────────────────────────────────
  if (loadError) {
    const errorKey = `error.${loadError.toLowerCase()}`
    return (
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
        {headerEl}
        <p className="mt-4 text-sm text-red-600">{t(errorKey)}</p>
      </div>
    )
  }

  // ── State gate — only available in 'delivery' state ──────────────────────
  if (state !== WEEK_STATES.DELIVERY) {
    return (
      <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
        {headerEl}
        <div className="mt-10 flex justify-center px-4">
          <p className="text-sm text-gray-600 text-center max-w-xs">
            {t('delivery.not_available_in_state')}
          </p>
        </div>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0EDE8] px-4 py-6">
      {headerEl}

      {/* Offline banner */}
      {isOffline && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          {t('offline.banner')}
        </div>
      )}

      {/* Assignment cards */}
      {assignments.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500 text-center">
          {t('empty.delivery_list')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {assignments.map((assignment) => {
            const localData = localDelivered.get(assignment.assignmentId)
            // Merge server-saved qty into the assignment object for variance display
            const mergedAssignment = localData
              ? { ...assignment, deliveredQty: localData.deliveredQty }
              : assignment

            const pending = pendingQueue.get(assignment.productId)
            const errorCode = saveErrors.get(assignment.assignmentId)
            const errorMsg = errorCode
              ? t(`error.${errorCode.toLowerCase()}`)
              : null

            return (
              <div key={assignment.assignmentId} className="flex flex-col gap-2">
                <DeliveryItemRow
                  assignment={mergedAssignment}
                  lang={lang}
                  onSave={handleSave}
                  pendingQty={pending?.deliveredQty ?? null}
                  isSaving={savingId === assignment.assignmentId}
                  lastSaveError={errorMsg}
                />

                {localData?.fcfsTriggered && localData.allocations?.length > 0 && (
                  <AllocationPanel
                    allocations={localData.allocations}
                    unit={assignment.unit}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
