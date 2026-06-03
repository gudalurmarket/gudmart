import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ChevronRight, Loader2 } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet } from '../../shared/lib/api.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR, formatSignedINR } from '../../shared/lib/paise.js'

function toLocalCalendarDate (value) {
  if (value == null || value === '') return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

function formatHistoryWeekDate (isoOrDate, lang) {
  const date = toLocalCalendarDate(isoOrDate)
  if (!date) return ''
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function combinedBalance (cash, bank) {
  return (cash ?? 0) + (bank ?? 0)
}

function HistoryWeekStateBadge ({ state, t }) {
  let className = 'bg-[--color-surface-raised] text-[--color-text-secondary]'
  if (state === WEEK_STATES.CLOSED) {
    className = 'bg-[--color-success-light] text-[--color-success]'
  } else if (state === WEEK_STATES.RECONCILIATION) {
    className = 'bg-[--color-warning-light] text-[--color-warning]'
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {t(`week.state.${state}`)}
    </span>
  )
}

function WeekHistoryRow ({
  week,
  closingBalance,
  closingLoading,
  onTap,
  t,
  lang,
}) {
  const marketDate = week.marketDate ?? week.market_date
  const openingTotal = combinedBalance(week.openingBalanceCash ?? week.opening_balance_cash, week.openingBalanceBank ?? week.opening_balance_bank)
  const isClosed = week.state === WEEK_STATES.CLOSED

  return (
    <button
      type="button"
      onClick={onTap}
      className="mb-2 flex w-full items-center gap-3 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3 text-left hover:border-[--color-primary]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[--color-text-primary]">
            <Calendar size={14} strokeWidth={1.5} className="text-[--color-text-secondary]" />
            {formatHistoryWeekDate(marketDate, lang)}
          </span>
          <HistoryWeekStateBadge state={week.state} t={t} />
        </div>

        <div className="grid gap-1 text-xs text-[--color-text-secondary] sm:grid-cols-2">
          <p>
            {t('history.opening_balance')}
            {': '}
            <span className="font-medium text-[--color-text-primary]">{formatINR(openingTotal)}</span>
          </p>
          {isClosed && (
            <p>
              {t('history.closing_balance')}
              {': '}
              {closingLoading ? (
                <Loader2 size={12} strokeWidth={1.5} className="inline animate-spin text-[--color-text-disabled]" />
              ) : closingBalance != null ? (
                <span className="font-medium text-[--color-primary]">{formatSignedINR(closingBalance)}</span>
              ) : (
                <span className="text-[--color-text-disabled]">—</span>
              )}
            </p>
          )}
        </div>
      </div>
      <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[--color-text-disabled]" />
    </button>
  )
}

export default function HistoryWeeks () {
  const navigate = useNavigate()
  const { t, lang } = useLang()

  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState(null)
  const [weeks, setWeeks] = useState([])
  const [closingByWeekId, setClosingByWeekId] = useState({})
  const [closingLoadingId, setClosingLoadingId] = useState(null)

  const loadWeeks = useCallback(async () => {
    setLoading(true)
    setErrorKey(null)
    try {
      const data = await apiGet('/api/v1/weeks?limit=52')
      const list = data.weeks ?? []
      const sorted = [...list].sort((a, b) => {
        const dateA = toLocalCalendarDate(a.marketDate ?? a.market_date)
        const dateB = toLocalCalendarDate(b.marketDate ?? b.market_date)
        if (!dateA || !dateB) return 0
        return dateB.getTime() - dateA.getTime()
      })
      setWeeks(sorted)
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
      setWeeks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWeeks()
  }, [loadWeeks])

  const handleWeekTap = useCallback(async (week) => {
    const weekId = resolveWeekId(week)
    if (!weekId) return

    if (week.state === WEEK_STATES.CLOSED) {
      if (closingByWeekId[weekId] == null) {
        setClosingLoadingId(weekId)
        try {
          const summary = await apiGet(`/api/v1/weeks/${weekId}/summary`)
          const total = combinedBalance(summary.closingBalanceCash, summary.closingBalanceBank)
          setClosingByWeekId((prev) => ({ ...prev, [weekId]: total }))
        } catch {
          // detail page handles missing summary
        } finally {
          setClosingLoadingId(null)
        }
      }
      navigate(`/operator/history/weeks/${weekId}`)
      return
    }

    navigate(`/operator/dashboard?weekId=${encodeURIComponent(weekId)}`)
  }, [closingByWeekId, navigate])

  const sortedWeeks = useMemo(() => weeks, [weeks])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[--color-background] p-4 pb-24">
      <h1 className="mb-6 text-xl font-bold text-[--color-primary]">{t('history.weeks.title')}</h1>

      {errorKey && (
        <p className="mb-4 text-sm text-[--color-error]" role="alert">
          {t(errorKey)}
        </p>
      )}

      {!errorKey && sortedWeeks.length === 0 && (
        <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-8 text-center">
          <p className="text-sm text-[--color-text-secondary]">{t('history.weeks.empty')}</p>
        </div>
      )}

      {sortedWeeks.length > 0 && (
        <ul className="list-none p-0">
          {sortedWeeks.map((week) => {
            const weekId = resolveWeekId(week)
            return (
              <li key={weekId ?? week.marketDate}>
                <WeekHistoryRow
                  week={week}
                  closingBalance={weekId ? closingByWeekId[weekId] : null}
                  closingLoading={closingLoadingId === weekId}
                  onTap={() => handleWeekTap(week)}
                  t={t}
                  lang={lang}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
