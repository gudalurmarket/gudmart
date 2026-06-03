import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import WeeklySummaryDetail from '../components/WeeklySummaryDetail.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, NotFoundError } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { WEEK_STATES } from '../../shared/lib/constants.js'

const CARD = 'mb-4 rounded-xl border border-[--color-border] bg-[--color-surface] p-4'

export default function HistoryWeekDetail () {
  const { weekId } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()

  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState(null)
  const [notGenerated, setNotGenerated] = useState(false)
  const [weekState, setWeekState] = useState(null)
  const [marketDate, setMarketDate] = useState(null)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load () {
      setLoading(true)
      setErrorKey(null)
      setNotGenerated(false)
      setSummary(null)

      try {
        const weekData = await apiGet(`/api/v1/weeks/${weekId}`)
        const week = weekData.week ?? weekData

        if (cancelled) return

        if (week.state !== WEEK_STATES.CLOSED) {
          navigate(`/operator/dashboard?weekId=${encodeURIComponent(weekId)}`, { replace: true })
          return
        }

        setWeekState(week.state)
        setMarketDate(week.marketDate ?? week.market_date)

        try {
          const summaryData = await apiGet(`/api/v1/weeks/${weekId}/summary`)
          if (cancelled) return
          setSummary(summaryData)
        } catch (err) {
          if (cancelled) return
          if (err instanceof NotFoundError) {
            setNotGenerated(true)
          } else {
            throw err
          }
        }
      } catch (err) {
        if (cancelled) return
        setErrorKey(apiErrorTranslationKey(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [weekId, navigate])

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[--color-background] p-4 pb-24">
      <button
        type="button"
        onClick={() => navigate('/operator/history/weeks')}
        className="mb-4 flex items-center gap-1 rounded-lg p-1 text-sm text-[--color-text-secondary] hover:bg-[--color-surface]"
      >
        <ArrowLeft size={18} strokeWidth={1.5} />
        {t('history.back_to_weeks')}
      </button>

      {errorKey && (
        <div className={CARD}>
          <p className="text-sm text-[--color-error]">{t(errorKey)}</p>
        </div>
      )}

      {notGenerated && (
        <div className={CARD}>
          <p className="text-sm text-[--color-text-secondary]">{t('summary.not_generated_yet')}</p>
        </div>
      )}

      {summary && (
        <WeeklySummaryDetail
          summary={summary}
          weekState={weekState}
          marketDate={marketDate}
          t={t}
          formatDate={formatDate}
          formatDateTime={formatDateTime}
        />
      )}
    </div>
  )
}
