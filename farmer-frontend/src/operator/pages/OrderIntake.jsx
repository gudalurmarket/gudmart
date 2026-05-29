import { useCallback, useEffect, useState } from 'react'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import useWeekState from '../../shared/hooks/useWeekState.js'
import useSSE from '../../shared/hooks/useSSE.js'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet } from '../../shared/lib/api.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'
import IntakeQueueHeader from '../components/IntakeQueueHeader.jsx'
import ParsedMessageCard, { buildApproveToast } from '../components/ParsedMessageCard.jsx'

const TOAST_DISMISS_MS = 6000

export default function OrderIntake () {
  const { t } = useLang()
  const { week, state, loading: weekLoading } = useWeekState()
  const [pendingMessages, setPendingMessages] = useState([])
  const [produceList, setProduceList] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchErrorKey, setFetchErrorKey] = useState(null)
  const [toast, setToast] = useState(null)

  const weekId = resolveWeekId(week)
  const weekIsOpen = state === WEEK_STATES.OPEN

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
    if (!weekId || !weekIsOpen) {
      setLoading(false)
      return
    }
    setLoading(true)
    await Promise.all([fetchIntake(), fetchProduce()])
    setLoading(false)
  }, [weekId, weekIsOpen, fetchIntake, fetchProduce])

  useEffect(() => {
    loadQueueData()
  }, [loadQueueData])

  const handleSSEMessage = useCallback(() => {
    fetchIntake()
  }, [fetchIntake])

  const { status: sseStatus } = useSSE('/api/v1/events/intake-queue', {
    onMessage: handleSSEMessage,
    enabled: weekIsOpen && Boolean(weekId),
  })

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const handleProcessed = useCallback(
    (messageId, result) => {
      setPendingMessages((prev) =>
        prev.filter((m) => m.messageId !== messageId),
      )

      if (result?.action === 'approve') {
        const approveToast = buildApproveToast(result)
        if (approveToast) {
          setToast(approveToast)
        }
      } else if (result?.action === 'reject') {
        setToast({ key: 'toast.order_rejected', shortfallAmount: null })
      }

      fetchIntake()
    },
    [fetchIntake, t],
  )

  if (weekLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StateMachineBadge state={state} />
      </div>

      {!weekIsOpen && (
        <p className="text-[--color-text-secondary]">{t('intake.not_open')}</p>
      )}

      {weekIsOpen && weekId && (
        <section className="relative rounded-lg bg-[--color-surface] p-4 shadow-md">
          <IntakeQueueHeader count={pendingMessages.length} sseStatus={sseStatus} />

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

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-gray-200 bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-[--color-text-primary]">
            {t(toast.key)}
          </p>
          {toast.shortfallAmount != null && (
            <p className="mt-1 text-sm text-[--color-text-secondary]">
              {t('intake.shortfall_amount')}: {formatINR(toast.shortfallAmount)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
