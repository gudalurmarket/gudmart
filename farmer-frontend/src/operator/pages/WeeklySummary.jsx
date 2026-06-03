import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import WeeklySummaryDetail, { WeeklySummaryPageHeader } from '../components/WeeklySummaryDetail.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, NotFoundError } from '../../shared/lib/api.js'
import { resolveWeekId } from '../../shared/lib/apiErrors.js'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'

const CARD = 'bg-[--color-surface] rounded-xl border border-[--color-border] p-4 mb-4'

export default function WeeklySummary () {
  const { t } = useLang()
  const [searchParams] = useSearchParams()
  const paramWeekId = searchParams.get('weekId')

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [weekState, setWeekState] = useState(null)
  const [marketDate, setMarketDate] = useState(null)
  const [summary, setSummary] = useState(null)
  const [notAvailable, setNotAvailable] = useState(false)
  const [notGenerated, setNotGenerated] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load () {
      setLoading(true)
      setLoadError(null)
      setNotAvailable(false)
      setNotGenerated(false)
      setSummary(null)

      try {
        const weeksRes = await apiGet('/api/v1/weeks')
        const weekList = Array.isArray(weeksRes) ? weeksRes : (weeksRes.weeks ?? [])

        let targetWeek = null

        if (paramWeekId) {
          targetWeek = weekList.find(w => resolveWeekId(w) === paramWeekId) ?? null
          if (!targetWeek) {
            try {
              targetWeek = await apiGet(`/api/v1/weeks/${paramWeekId}`)
            } catch {
              // week not found via direct fetch — fall through to notAvailable
            }
          }
        } else {
          const sorted = weekList
            .filter(w => w.state === WEEK_STATES.CLOSED)
            .sort((a, b) => {
              const dateA = new Date(a.marketDate ?? a.market_date)
              const dateB = new Date(b.marketDate ?? b.market_date)
              return dateB - dateA
            })
          targetWeek = sorted[0] ?? null
        }

        if (cancelled) return

        if (!targetWeek || targetWeek.state !== WEEK_STATES.CLOSED) {
          setWeekState(targetWeek?.state ?? null)
          setNotAvailable(true)
          setLoading(false)
          return
        }

        setWeekState(targetWeek.state)
        setMarketDate(targetWeek.marketDate ?? targetWeek.market_date)

        const targetWeekId = resolveWeekId(targetWeek)
        if (!targetWeekId) {
          throw new Error('Week id missing from API response')
        }

        try {
          const summaryData = await apiGet(`/api/v1/weeks/${targetWeekId}/summary`)
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
        setLoadError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [paramWeekId])

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
      <div className="flex min-h-full items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[--color-background] p-4">
        <WeeklySummaryPageHeader weekState={weekState} marketDate={null} formatDate={formatDate} t={t} />
        <div className={CARD}>
          <p className="text-sm text-[--color-error]">{t('error.unknown')}</p>
        </div>
      </div>
    )
  }

  if (notAvailable) {
    return (
      <div className="min-h-full bg-[--color-background] p-4">
        <WeeklySummaryPageHeader weekState={weekState} marketDate={null} formatDate={formatDate} t={t} />
        <div className={CARD}>
          <p className="text-sm text-[--color-text-secondary]">{t('summary.not_yet_available')}</p>
        </div>
      </div>
    )
  }

  if (notGenerated) {
    return (
      <div className="min-h-full bg-[--color-background] p-4">
        <WeeklySummaryPageHeader weekState={weekState} marketDate={marketDate} formatDate={formatDate} t={t} />
        <div className={CARD}>
          <p className="text-sm text-[--color-text-secondary]">{t('summary.not_generated_yet')}</p>
        </div>
      </div>
    )
  }

  if (!summary) return null

  return (
    <div className="min-h-full bg-[--color-background] p-4">
      <WeeklySummaryDetail
        summary={summary}
        weekState={weekState}
        marketDate={marketDate}
        t={t}
        formatDate={formatDate}
        formatDateTime={formatDateTime}
      />
    </div>
  )
}
