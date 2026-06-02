import { useCallback, useEffect, useState } from 'react'
import { Plus } from '../../shared/components/AppIcons.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import useWeekState from '../../shared/hooks/useWeekState.js'
import useSSE from '../../shared/hooks/useSSE.js'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet } from '../../shared/lib/api.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import { ORDER_STATUS, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'
import IntakeQueueHeader from '../components/IntakeQueueHeader.jsx'
import ParsedMessageCard, { buildApproveToast } from '../components/ParsedMessageCard.jsx'
import ManualOrderForm from '../components/ManualOrderForm.jsx'

const TOAST_DISMISS_MS = 6000

export default function OrderIntake () {
  const { t } = useLang()
  const { week, state, loading: weekLoading } = useWeekState()
  const [pendingMessages, setPendingMessages] = useState([])
  const [allMessages, setAllMessages] = useState([])
  const [produceList, setProduceList] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchErrorKey, setFetchErrorKey] = useState(null)
  const [toast, setToast] = useState(null)
  const [showManualForm, setShowManualForm] = useState(false)

  const weekId = resolveWeekId(week)
  const weekIsOpen = state === WEEK_STATES.OPEN

  /* ── Data fetching ─────────────────────────────────────────── */

  const fetchIntake = useCallback(async () => {
    if (!weekId) return
    try {
      const data = await apiGet(
        `/api/v1/weeks/${weekId}/intake?queueStatus=pending`,
      )
      const messages = (data.messages ?? []).filter(
        (m) => m.queueStatus === 'pending',
      )
      setPendingMessages(messages)
      setFetchErrorKey(null)
    } catch (err) {
      setFetchErrorKey(apiErrorTranslationKey(err))
    }
  }, [weekId])

  const fetchAllMessages = useCallback(async () => {
    if (!weekId) return
    try {
      const data = await apiGet(`/api/v1/weeks/${weekId}/intake`)
      setAllMessages(data.messages ?? [])
      setFetchErrorKey(null)
    } catch (err) {
      setFetchErrorKey(apiErrorTranslationKey(err))
    }
  }, [weekId])

  const fetchProduce = useCallback(async () => {
    if (!weekId) return
    try {
      const data = await apiGet(`/api/v1/weeks/${weekId}/produce`)
      setProduceList(data.items ?? [])
    } catch (err) {
      setFetchErrorKey(apiErrorTranslationKey(err))
    }
  }, [weekId])

  const loadQueueData = useCallback(async () => {
    if (!weekId) {
      setLoading(false)
      return
    }
    setLoading(true)
    if (weekIsOpen) {
      await Promise.all([fetchIntake(), fetchProduce()])
    } else {
      await fetchAllMessages()
    }
    setLoading(false)
  }, [weekId, weekIsOpen, fetchIntake, fetchAllMessages, fetchProduce])

  useEffect(() => {
    loadQueueData()
  }, [loadQueueData])

  /* ── SSE — pass weekId so polling fallback works after 3 SSE failures ── */

  const handleSSEMessage = useCallback(() => {
    fetchIntake()
  }, [fetchIntake])

  const { status: sseStatus } = useSSE('/api/v1/events/intake-queue', {
    weekId,
    onMessage: handleSSEMessage,
    enabled: weekIsOpen && Boolean(weekId),
  })

  /* ── Toast auto-dismiss ────────────────────────────────────── */

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast])

  /* ── Handlers ─────────────────────────────────────────────── */

  const handleProcessed = useCallback(
    (messageId, result) => {
      setPendingMessages((prev) =>
        prev.filter((m) => m.messageId !== messageId),
      )

      if (result?.action === 'approve') {
        const approveToast = buildApproveToast(result)
        if (approveToast) setToast(approveToast)
      } else if (result?.action === 'reject') {
        setToast({ key: 'toast.order_rejected', shortfallAmount: null })
      }

      fetchIntake()
    },
    [fetchIntake],
  )

  const handleManualOrderSuccess = useCallback(
    (result) => {
      setShowManualForm(false)
      if (result?.status === ORDER_STATUS.CONFIRMED) {
        setToast({
          key: 'intake.manual_order.confirmed',
          shortfallAmount: result.walletDebited ?? null,
          isConfirmed: true,
        })
      } else if (result?.status === ORDER_STATUS.PENDING_PAYMENT) {
        setToast({
          key: 'intake.manual_order.pending_payment',
          shortfallAmount: result.shortfallAmount ?? null,
          isConfirmed: false,
        })
      }
      fetchIntake()
    },
    [fetchIntake],
  )

  /* ── Loading skeleton ─────────────────────────────────────── */

  if (weekLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StateMachineBadge state={state} />
      </div>

      {/* ── Week not open: read-only view of all messages ── */}
      {!weekIsOpen && weekId && (
        <section className="rounded-lg bg-[--color-surface] p-4 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3">
            <h1 className="text-xl font-semibold text-[--color-text-primary]">
              {t('nav.order_intake')}
            </h1>
          </div>

          <p className="mt-3 text-sm text-[--color-text-secondary]">
            {t('intake.queue_readonly_notice')}
          </p>

          {fetchErrorKey && (
            <p className="mt-4 text-sm text-[--color-error]" role="alert">
              {t(fetchErrorKey)}
            </p>
          )}

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : allMessages.length === 0 ? (
            <p className="py-16 text-center text-[--color-text-secondary]">
              {t('empty.intake_queue')}
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {allMessages.map((message) => (
                <li key={message.messageId}>
                  <ParsedMessageCard
                    message={message}
                    produceList={[]}
                    weekId={weekId}
                    onProcessed={() => {}}
                    readOnly
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Week not open and no weekId: generic message ── */}
      {!weekIsOpen && !weekId && (
        <p className="text-[--color-text-secondary]">{t('intake.not_open')}</p>
      )}

      {/* ── Week is open: live queue + manual entry ── */}
      {weekIsOpen && weekId && (
        <section className="relative rounded-lg bg-[--color-surface] p-4 shadow-md">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <IntakeQueueHeader count={pendingMessages.length} sseStatus={sseStatus} />
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-text-inverse] hover:bg-[--color-primary-dark]"
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              {t('intake.add_manually_button')}
            </button>
          </div>

          {showManualForm && (
            <div className="mb-6">
              <ManualOrderForm
                weekId={weekId}
                produceList={produceList}
                onSuccess={handleManualOrderSuccess}
                onCancel={() => setShowManualForm(false)}
              />
            </div>
          )}

          {fetchErrorKey && (
            <p className="mt-4 text-sm text-[--color-error]" role="alert">
              {t(fetchErrorKey)}
            </p>
          )}

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : pendingMessages.length === 0 ? (
            <p className="py-16 text-center text-[--color-text-secondary]">
              {t('empty.intake_queue')}
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {pendingMessages.map((message) => (
                <li key={message.messageId}>
                  <ParsedMessageCard
                    message={message}
                    produceList={produceList}
                    weekId={weekId}
                    onProcessed={handleProcessed}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-[--color-border] bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-[--color-text-primary]">
            {t(toast.key)}
          </p>
          {toast.isConfirmed && toast.shortfallAmount > 0 && (
            <p className="mt-1 text-sm text-[--color-text-secondary]">
              {formatINR(toast.shortfallAmount)}
            </p>
          )}
          {!toast.isConfirmed && toast.shortfallAmount != null && (
            <p className="mt-1 text-sm text-[--color-text-secondary]">
              {t('intake.shortfall_amount')}: {formatINR(toast.shortfallAmount)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
