import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { formatINR } from '../../shared/lib/paise.js'
import { apiGet, NotFoundError } from '../../shared/lib/api.js'
import { resolveWeekId } from '../../shared/lib/apiErrors.js'
import { WEEK_STATES } from '../../shared/lib/constants.js'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'

const CARD = 'bg-[--color-surface] rounded-xl border border-[--color-border] p-4 mb-4'
const TH = 'text-xs font-semibold text-[--color-text-secondary] uppercase tracking-wide py-2 text-right'
const TD = 'py-2 text-right text-sm'
const TD_LABEL = 'py-2 text-sm text-[--color-text-secondary]'
const SUBTOTAL_ROW = 'bg-[--color-surface-raised] border-t border-[--color-border] font-semibold'

export default function WeeklySummary() {
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

    async function load() {
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
      <div className="min-h-full bg-[--color-background] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-[--color-background] p-4">
        <PageHeader weekState={weekState} marketDate={null} formatDate={formatDate} t={t} />
        <div className={CARD}>
          <p className="text-[--color-error] text-sm">{t('error.unknown')}</p>
        </div>
      </div>
    )
  }

  if (notAvailable) {
    return (
      <div className="min-h-full bg-[--color-background] p-4">
        <PageHeader weekState={weekState} marketDate={null} formatDate={formatDate} t={t} />
        <div className={CARD}>
          <p className="text-[--color-text-secondary] text-sm">{t('summary.not_yet_available')}</p>
        </div>
      </div>
    )
  }

  if (notGenerated) {
    return (
      <div className="min-h-full bg-[--color-background] p-4">
        <PageHeader weekState={weekState} marketDate={marketDate} formatDate={formatDate} t={t} />
        <div className={CARD}>
          <p className="text-[--color-text-secondary] text-sm">{t('summary.not_generated_yet')}</p>
        </div>
      </div>
    )
  }

  if (!summary) return null

  // Derive all totals as const variables — no inline arithmetic in JSX
  const openingTotal = summary.openingBalanceCash + summary.openingBalanceBank

  const totalReceiptsCash =
    summary.preorderReceiptsCash + summary.marketDayReceiptsCash + summary.walkinReceiptsCash
  const totalReceiptsBank =
    summary.preorderReceiptsBank + summary.marketDayReceiptsBank + summary.walkinReceiptsBank

  const totalExpensesCash = summary.outstationFarmerPaidCash + summary.localFarmerPaidCash
  const totalExpensesBank = summary.outstationFarmerPaidBank + summary.localFarmerPaidBank

  const closingTotal = summary.closingBalanceCash + summary.closingBalanceBank

  const hasOutstanding =
    summary.outstandingFarmerLiabilities > 0 || summary.outstandingCustomerDues > 0

  return (
    <div className="min-h-full bg-[--color-background] p-4">
      <PageHeader weekState={weekState} marketDate={marketDate} formatDate={formatDate} t={t} />

      {/* Section 1 — Opening Balance */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[--color-primary] mb-3">
          {t('summary.opening_balance_title')}
        </h2>
        <table className="w-full">
          <tbody>
            <tr>
              <td className={TD_LABEL}>{t('summary.cash_label')}</td>
              <td className={TD}>{formatINR(summary.openingBalanceCash)}</td>
            </tr>
            <tr>
              <td className={TD_LABEL}>{t('summary.bank_label')}</td>
              <td className={TD}>{formatINR(summary.openingBalanceBank)}</td>
            </tr>
            <tr className={SUBTOTAL_ROW}>
              <td className="py-2 text-sm">{t('summary.total_label')}</td>
              <td className={TD}>{formatINR(openingTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section 2 — Receipts */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[--color-primary] mb-3">
          {t('summary.receipts_title')}
        </h2>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-xs font-semibold text-[--color-text-secondary] py-2 text-left" />
              <th className={TH}>{t('summary.cash_label')}</th>
              <th className={TH}>{t('summary.bank_label')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={TD_LABEL}>{t('summary.preorder_receipts')}</td>
              <td className={TD}>{formatINR(summary.preorderReceiptsCash)}</td>
              <td className={TD}>{formatINR(summary.preorderReceiptsBank)}</td>
            </tr>
            <tr>
              <td className={TD_LABEL}>{t('summary.market_day_receipts')}</td>
              <td className={TD}>{formatINR(summary.marketDayReceiptsCash)}</td>
              <td className={TD}>{formatINR(summary.marketDayReceiptsBank)}</td>
            </tr>
            <tr>
              <td className={TD_LABEL}>{t('summary.walkin_receipts')}</td>
              <td className={TD}>{formatINR(summary.walkinReceiptsCash)}</td>
              <td className={TD}>{formatINR(summary.walkinReceiptsBank)}</td>
            </tr>
            <tr className={SUBTOTAL_ROW}>
              <td className="py-2 text-sm">{t('summary.total_receipts')}</td>
              <td className={TD}>{formatINR(totalReceiptsCash)}</td>
              <td className={TD}>{formatINR(totalReceiptsBank)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      {/* Section 3 — Expenses */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[--color-primary] mb-3">
          {t('summary.expenses_title')}
        </h2>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-xs font-semibold text-[--color-text-secondary] py-2 text-left" />
              <th className={TH}>{t('summary.cash_label')}</th>
              <th className={TH}>{t('summary.bank_label')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={TD_LABEL}>{t('summary.outstation_farmer_expenses')}</td>
              <td className={TD}>{formatINR(summary.outstationFarmerPaidCash)}</td>
              <td className={TD}>{formatINR(summary.outstationFarmerPaidBank)}</td>
            </tr>
            <tr>
              <td className={TD_LABEL}>{t('summary.local_farmer_expenses')}</td>
              <td className={TD}>{formatINR(summary.localFarmerPaidCash)}</td>
              <td className={TD}>{formatINR(summary.localFarmerPaidBank)}</td>
            </tr>
            <tr className={SUBTOTAL_ROW}>
              <td className="py-2 text-sm">{t('summary.total_expenses')}</td>
              <td className={TD}>{formatINR(totalExpensesCash)}</td>
              <td className={TD}>{formatINR(totalExpensesBank)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      {/* Section 4 — Wallet Adjustments (informational) */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[--color-primary] mb-1">
          {t('summary.wallet_adjustments_title')}
        </h2>
        <p className="text-xs text-[--color-text-disabled] mb-3">{t('summary.wallet_adjustments_note')}</p>
        <table className="w-full">
          <tbody>
            <tr>
              <td className={TD_LABEL}>{t('summary.price_diff_credits')}</td>
              <td className="py-2 text-right text-sm font-medium text-[--color-warning]">
                {formatINR(summary.walletAdjustmentsCredits)}
              </td>
            </tr>
            <tr>
              <td className={TD_LABEL}>{t('summary.price_diff_debits')}</td>
              <td className="py-2 text-right text-sm font-medium text-[--color-info]">
                {formatINR(summary.walletAdjustmentsDebits)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section 5 — Outstanding Items */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[--color-primary] mb-3">
          {t('summary.outstanding_title')}
        </h2>
        <table className="w-full">
          <tbody>
            <tr>
              <td className={TD_LABEL}>{t('summary.outstanding_farmer_liabilities')}</td>
              <td
                className={`py-2 text-right text-sm font-medium ${
                  summary.outstandingFarmerLiabilities > 0 ? 'text-[--color-error]' : 'text-[--color-text-disabled]'
                }`}
              >
                {formatINR(summary.outstandingFarmerLiabilities)}
              </td>
            </tr>
            <tr>
              <td className={TD_LABEL}>{t('summary.outstanding_customer_dues')}</td>
              <td
                className={`py-2 text-right text-sm font-medium ${
                  summary.outstandingCustomerDues > 0 ? 'text-[--color-error]' : 'text-[--color-text-disabled]'
                }`}
              >
                {formatINR(summary.outstandingCustomerDues)}
              </td>
            </tr>
          </tbody>
        </table>
        {!hasOutstanding && (
          <p className="text-xs text-[--color-success] mt-2">{t('summary.no_outstanding_items')}</p>
        )}
      </div>

      {/* Section 6 — Closing Balance */}
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[--color-primary] mb-3">
          {t('summary.closing_balance_title')}
        </h2>
        <div className="bg-[--color-background] rounded-xl p-4">
          <table className="w-full">
            <tbody>
              <tr>
                <td className="py-1.5 text-sm font-semibold text-[--color-primary]">
                  {t('summary.cash_label')}
                </td>
                <td className="py-1.5 text-right text-sm font-semibold text-[--color-primary]">
                  {formatINR(summary.closingBalanceCash)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-sm font-semibold text-[--color-primary]">
                  {t('summary.bank_label')}
                </td>
                <td className="py-1.5 text-right text-sm font-semibold text-[--color-primary]">
                  {formatINR(summary.closingBalanceBank)}
                </td>
              </tr>
              <tr className="border-t border-[--color-border]">
                <td className="pt-3 pb-1 text-2xl font-bold text-[--color-primary]">
                  {t('summary.total_label')}
                </td>
                <td className="pt-3 pb-1 text-right text-2xl font-bold text-[--color-primary]">
                  {formatINR(closingTotal)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-[--color-text-secondary] mt-3">{t('summary.carry_forward_note')}</p>
        </div>
      </div>

      {/* Section 7 — Generated at */}
      {summary.generatedAt && (
        <p className="text-xs text-[--color-text-disabled] text-right mb-4">
          {t('summary.generated_at')} {formatDateTime(summary.generatedAt)}
        </p>
      )}
    </div>
  )
}

function PageHeader({ weekState, marketDate, formatDate, t }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-[--color-primary]">{t('summary.page_title')}</h1>
        {weekState && <StateMachineBadge state={weekState} />}
      </div>
      {marketDate && (
        <div className="flex items-center gap-1.5 text-sm text-[--color-text-secondary]">
          <Calendar size={14} strokeWidth={1.5} />
          <span>{formatDate(marketDate)}</span>
        </div>
      )}
    </div>
  )
}
