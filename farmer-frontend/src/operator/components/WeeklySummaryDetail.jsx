import { Calendar } from 'lucide-react'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { formatINR, formatSignedINR } from '../../shared/lib/paise.js'

const CARD = 'bg-[--color-surface] rounded-xl border border-[--color-border] p-4 mb-4'
const TH = 'text-xs font-semibold text-[--color-text-secondary] uppercase tracking-wide py-2 text-right'
const TD = 'py-2 text-right text-sm'
const TD_LABEL = 'py-2 text-sm text-[--color-text-secondary]'
const SUBTOTAL_ROW = 'bg-[--color-surface-raised] border-t border-[--color-border] font-semibold'

export function WeeklySummaryPageHeader ({ weekState, marketDate, formatDate, t, titleKey = 'summary.page_title' }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-[--color-primary]">{t(titleKey)}</h1>
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

export default function WeeklySummaryDetail ({ summary, weekState, marketDate, t, formatDate, formatDateTime }) {
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
    <>
      <WeeklySummaryPageHeader
        weekState={weekState}
        marketDate={marketDate}
        formatDate={formatDate}
        t={t}
      />

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-[--color-primary]">
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

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-[--color-primary]">
          {t('summary.receipts_title')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="py-2 text-left text-xs font-semibold text-[--color-text-secondary]" />
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

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-[--color-primary]">
          {t('summary.expenses_title')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="py-2 text-left text-xs font-semibold text-[--color-text-secondary]" />
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

      <div className={CARD}>
        <h2 className="mb-1 text-sm font-semibold text-[--color-primary]">
          {t('summary.wallet_adjustments_title')}
        </h2>
        <p className="mb-3 text-xs text-[--color-text-disabled]">{t('summary.wallet_adjustments_note')}</p>
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

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-[--color-primary]">
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
          <p className="mt-2 text-xs text-[--color-success]">{t('summary.no_outstanding_items')}</p>
        )}
      </div>

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-semibold text-[--color-primary]">
          {t('summary.closing_balance_title')}
        </h2>
        <div className="rounded-xl bg-[--color-background] p-4">
          <table className="w-full">
            <tbody>
              <tr>
                <td className="py-1.5 text-sm font-semibold text-[--color-primary]">
                  {t('summary.cash_label')}
                </td>
                <td className="py-1.5 text-right text-sm font-semibold text-[--color-primary]">
                  {formatSignedINR(summary.closingBalanceCash)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-sm font-semibold text-[--color-primary]">
                  {t('summary.bank_label')}
                </td>
                <td className="py-1.5 text-right text-sm font-semibold text-[--color-primary]">
                  {formatSignedINR(summary.closingBalanceBank)}
                </td>
              </tr>
              <tr className="border-t border-[--color-border]">
                <td className="pb-1 pt-3 text-2xl font-bold text-[--color-primary]">
                  {t('summary.total_label')}
                </td>
                <td className="pb-1 pt-3 text-right text-2xl font-bold text-[--color-primary]">
                  {formatSignedINR(closingTotal)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[--color-text-secondary]">{t('summary.carry_forward_note')}</p>
        </div>
      </div>

      {summary.generatedAt && (
        <p className="mb-4 text-right text-xs text-[--color-text-disabled]">
          {t('summary.generated_at')}
          {' '}
          {formatDateTime(summary.generatedAt)}
        </p>
      )}
    </>
  )
}
