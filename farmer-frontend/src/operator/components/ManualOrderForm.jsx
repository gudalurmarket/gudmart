import { useEffect, useMemo, useState } from 'react'
import { X } from '../../shared/components/AppIcons.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { ApiError, apiGet, apiPost } from '../../shared/lib/api.js'
import { formatINR } from '../../shared/lib/paise.js'
import LineItemEditor, {
  editorRowsToApiLineItems,
  parsedItemsToEditorRows,
  validateEditorLineItems,
} from './LineItemEditor.jsx'

function apiErrorTranslationKey (err) {
  if (!(err instanceof ApiError)) return 'error.unknown'
  const codeMap = {
    WALLET_INSUFFICIENT: 'error.wallet_insufficient',
    ACTION_NOT_PERMITTED_IN_STATE: 'error.action_not_permitted_in_state',
    CUSTOMER_NOT_FOUND: 'error.customer_not_found',
    PRODUCE_ITEM_NOT_FOUND: 'error.validation',
    VALIDATION_ERROR: 'error.validation',
    FORBIDDEN: 'error.forbidden',
    UNAUTHORISED: 'error.unauthorised',
    NETWORK_ERROR: 'error.network_error',
  }
  return codeMap[err.code] ?? 'error.unknown'
}

/**
 * Inline form for Path 2 — manual (non-WhatsApp) order entry.
 * Rendered inside the Order Intake screen when weekIsOpen.
 *
 * @param {{ weekId: string, produceList: object[], onSuccess: (result: object) => void, onCancel: () => void }} props
 */
export default function ManualOrderForm ({ weekId, produceList, onSuccess, onCancel }) {
  const { t } = useLang()

  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState(null)

  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [lineItems, setLineItems] = useState(() => parsedItemsToEditorRows([]))
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [customerRequiredError, setCustomerRequiredError] = useState(false)
  const [lineItemsError, setLineItemsError] = useState(false)
  const [apiErrorKey, setApiErrorKey] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiGet('/api/v1/customers?active=true')
      .then((data) => {
        if (!cancelled) setCustomers(data.customers ?? [])
      })
      .catch((err) => {
        if (!cancelled) setCustomersError(apiErrorTranslationKey(err))
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q),
    )
  }, [customers, customerSearch])

  const selectedCustomer = customers.find((c) => c.customerId === selectedCustomerId) ?? null

  const handleSubmit = async () => {
    setCustomerRequiredError(false)
    setLineItemsError(false)
    setApiErrorKey(null)

    let hasError = false
    if (!selectedCustomerId) {
      setCustomerRequiredError(true)
      hasError = true
    }
    if (!validateEditorLineItems(lineItems)) {
      setLineItemsError(true)
      hasError = true
    }
    if (hasError) return

    setSubmitting(true)
    try {
      const body = {
        customerId: selectedCustomerId,
        lineItems: editorRowsToApiLineItems(lineItems),
      }
      if (notes.trim()) body.notes = notes.trim()

      const result = await apiPost(`/api/v1/weeks/${weekId}/orders`, body)
      onSuccess(result)
    } catch (err) {
      setApiErrorKey(apiErrorTranslationKey(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      className="rounded-lg border border-[--color-primary] bg-[--color-surface] p-4 shadow-md"
      aria-label={t('intake.manual_order.title')}
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[--color-text-primary]">
          {t('intake.manual_order.title')}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[--color-text-secondary] hover:text-[--color-text-primary] disabled:opacity-60"
          aria-label={t('action.cancel')}
        >
          <X size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>

      {/* Customer selector */}
      <div className="mb-4 space-y-1">
        <label
          htmlFor="manual-order-customer-search"
          className="block text-sm font-medium text-[--color-text-primary]"
        >
          {t('field.customer_name')}
          <span className="ml-1 text-[--color-error]" aria-hidden="true">*</span>
        </label>

        {customersLoading ? (
          <p className="text-sm text-[--color-text-secondary]">{t('action.loading')}</p>
        ) : customersError ? (
          <p className="text-sm text-[--color-error]" role="alert">{t(customersError)}</p>
        ) : (
          <>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 rounded-md border border-[--color-primary] bg-[--color-primary-light] px-3 py-2">
                <span className="flex-1 text-sm font-medium text-[--color-text-primary]">
                  {selectedCustomer.name}
                  <span className="ml-2 text-xs font-normal text-[--color-text-secondary]">
                    {selectedCustomer.phone} &bull; {formatINR(selectedCustomer.walletBalance)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId('')
                    setCustomerSearch('')
                    setCustomerRequiredError(false)
                  }}
                  className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded text-[--color-text-secondary] hover:text-[--color-error]"
                  aria-label={t('action.cancel')}
                >
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  id="manual-order-customer-search"
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder={t('intake.manual_order.customer_placeholder')}
                  className={`w-full min-h-[44px] rounded-md border px-3 py-2 text-sm focus:border-[--color-primary] focus:outline-none focus:ring-1 focus:ring-[--color-primary] ${
                    customerRequiredError ? 'border-[--color-error]' : 'border-[--color-border]'
                  }`}
                  autoComplete="off"
                />
                {filteredCustomers.length > 0 ? (
                  <select
                    size={Math.min(filteredCustomers.length, 6)}
                    value=""
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value)
                      setCustomerSearch('')
                      setCustomerRequiredError(false)
                    }}
                    className="w-full rounded-md border border-[--color-border] text-sm"
                    aria-label={t('field.customer_name')}
                  >
                    <option value="" disabled hidden />
                    {filteredCustomers.map((c) => (
                      <option key={c.customerId} value={c.customerId}>
                        {c.name} — {c.phone} ({formatINR(c.walletBalance)})
                      </option>
                    ))}
                  </select>
                ) : customerSearch.trim() ? (
                  <p className="text-sm text-[--color-text-secondary]">
                    {t('empty.customer_list')}
                  </p>
                ) : null}
              </div>
            )}
          </>
        )}
        {customerRequiredError && (
          <p className="text-sm text-[--color-error]" role="alert">
            {t('intake.manual_order.customer_required')}
          </p>
        )}
      </div>

      {/* Line items */}
      <div className="mb-4">
        <LineItemEditor
          lineItems={lineItems}
          produceList={produceList}
          onChange={setLineItems}
        />
        {lineItemsError && (
          <p className="mt-2 text-sm text-[--color-error]" role="alert">
            {t('intake.validation.line_items')}
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label
          htmlFor="manual-order-notes"
          className="mb-1 block text-sm font-medium text-[--color-text-primary]"
        >
          {t('field.notes')}
        </label>
        <textarea
          id="manual-order-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('field.notes.placeholder')}
          className="w-full rounded-md border border-[--color-border] px-3 py-2 text-sm focus:border-[--color-primary] focus:outline-none focus:ring-1 focus:ring-[--color-primary]"
        />
      </div>

      {apiErrorKey && (
        <p className="mb-3 text-sm text-[--color-error]" role="alert">
          {t(apiErrorKey)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="min-h-[44px] rounded-md bg-[--color-primary] px-5 py-2 text-sm font-medium text-[--color-text-inverse] hover:bg-[--color-primary-dark] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? t('action.loading') : t('intake.manual_order.submit')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-[44px] rounded-md border border-[--color-border] px-4 py-2 text-sm font-medium text-[--color-text-secondary] hover:bg-[--color-surface-raised] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('action.cancel')}
        </button>
      </div>
    </section>
  )
}
