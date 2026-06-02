import { useRef, useState } from 'react'
import { Calendar, Loader2 } from 'lucide-react'
import { ApiError, apiPost } from '../../shared/lib/api.js'
import { parseINR } from '../../shared/lib/paise.js'

function todayDateInputValue () {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isDateOnOrAfterToday (dateStr) {
  if (!dateStr) return false
  return dateStr >= todayDateInputValue()
}

/** @param {HTMLInputElement | null} input */
function openDatePicker (input) {
  if (!input) return
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
      return
    } catch {
      // showPicker can throw if not triggered by user gesture in some browsers
    }
  }
  input.focus()
  input.click()
}

/**
 * @param {{ onCreated: () => void, onCancel?: () => void, t: (key: string) => string }} props
 */
export default function CreateWeekForm ({ onCreated, onCancel, t }) {
  const dateInputRef = useRef(null)
  const [marketDate, setMarketDate] = useState('')
  const [openingCash, setOpeningCash] = useState('')
  const [openingBank, setOpeningBank] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [validationErrorKey, setValidationErrorKey] = useState(null)
  const [marketDateError, setMarketDateError] = useState(null)
  const [genericError, setGenericError] = useState(null)

  const minDate = todayDateInputValue()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setValidationErrorKey(null)
    setMarketDateError(null)
    setGenericError(null)

    if (!marketDate || !isDateOnOrAfterToday(marketDate)) {
      setValidationErrorKey('error.validation')
      return
    }

    const cashPaise = parseINR(openingCash)
    const bankPaise = parseINR(openingBank)
    if (cashPaise == null || bankPaise == null) {
      setValidationErrorKey('error.validation')
      return
    }

    setSubmitting(true)
    try {
      await apiPost('/api/v1/weeks', {
        marketDate,
        openingBalanceCash: cashPaise,
        openingBalanceBank: bankPaise,
      })
      onCreated()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_MARKET_DATE') {
        setMarketDateError(t('error.duplicate_market_date'))
      } else if (err instanceof ApiError && err.message) {
        setGenericError(err.message)
      } else {
        setGenericError(t('error.unknown'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label
          htmlFor="week-market-date"
          className="mb-1 block text-sm font-medium text-[--color-text-secondary]"
        >
          {t('week_setup.market_date.label')}
        </label>
        <div className="relative">
          <input
            ref={dateInputRef}
            id="week-market-date"
            type="date"
            required
            min={minDate}
            value={marketDate}
            onChange={(e) => {
              setMarketDate(e.target.value)
              setMarketDateError(null)
            }}
            onClick={(e) => openDatePicker(e.currentTarget)}
            aria-invalid={marketDateError ? 'true' : undefined}
            aria-describedby={marketDateError ? 'week-market-date-error' : undefined}
            className={`input-date w-full rounded-lg border px-3 py-2 text-[--color-text-primary] ${
              marketDateError ? 'border-[--color-error]' : 'border-[--color-border]'
            }`}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('week_setup.market_date.label')}
            className="absolute right-2 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[--color-text-secondary] hover:text-[--color-primary]"
            onClick={() => openDatePicker(dateInputRef.current)}
          >
            <Calendar size={20} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        {marketDateError && (
          <p id="week-market-date-error" className="mt-1 text-sm text-[--color-error]" role="alert">
            {marketDateError}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="week-opening-cash"
          className="mb-1 block text-sm font-medium text-[--color-text-secondary]"
        >
          {t('week_setup.opening_cash.label')}
        </label>
        <input
          id="week-opening-cash"
          type="text"
          inputMode="decimal"
          required
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-[--color-text-primary]"
        />
        <p className="mt-1 text-xs text-[--color-text-secondary]">
          {t('week_setup.opening_balance.helper')}
        </p>
      </div>

      <div>
        <label
          htmlFor="week-opening-bank"
          className="mb-1 block text-sm font-medium text-[--color-text-secondary]"
        >
          {t('week_setup.opening_bank.label')}
        </label>
        <input
          id="week-opening-bank"
          type="text"
          inputMode="decimal"
          required
          value={openingBank}
          onChange={(e) => setOpeningBank(e.target.value)}
          className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-[--color-text-primary]"
        />
        <p className="mt-1 text-xs text-[--color-text-secondary]">
          {t('week_setup.opening_balance.helper')}
        </p>
      </div>

      {validationErrorKey && (
        <p className="text-sm text-[--color-error]" role="alert">
          {t(validationErrorKey)}
        </p>
      )}

      {genericError && (
        <p className="text-sm text-[--color-error]" role="alert">
          {genericError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="submit"
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-4 text-[--color-text-inverse] disabled:opacity-60"
        >
          {submitting && (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden />
          )}
          {t('week_setup.create_week.button')}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[--color-border] py-4 text-[--color-text-secondary] disabled:opacity-60"
          >
            {t('action.cancel')}
          </button>
        )}
      </div>
    </form>
  )
}
