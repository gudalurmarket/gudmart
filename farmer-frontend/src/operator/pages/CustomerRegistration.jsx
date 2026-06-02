import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Plus, X } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch, apiPost, DuplicatePhoneError } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { formatINR, parseINR } from '../../shared/lib/paise.js'
import useWeekState from '../../shared/hooks/useWeekState.js'

const TOAST_DISMISS_MS = 4000

function SlidePanel ({ open, onClose, children }) {
  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-[--color-surface] shadow-xl sm:w-96"
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </>
  )
}

function CustomerModal ({ mode, customer, onClose, onSaved, t }) {
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [openingBalanceInput, setOpeningBalanceInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [dupError, setDupError] = useState(false)
  const [generalError, setGeneralError] = useState(null)

  const isAdd = mode === 'add'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setDupError(false)
    setGeneralError(null)

    try {
      if (isAdd) {
        const openingPaise = parseINR(openingBalanceInput)
        const body = { name: name.trim(), phone: phone.trim() }
        if (openingPaise != null && openingPaise > 0) {
          body.openingWalletBalance = openingPaise
        }
        await apiPost('/api/v1/customers', body)
      } else {
        await apiPatch(`/api/v1/customers/${customer.customerId}`, {
          name: name.trim(),
          phone: phone.trim(),
        })
      }
      onSaved()
    } catch (err) {
      if (err instanceof DuplicatePhoneError) {
        setDupError(true)
      } else {
        setGeneralError(apiErrorTranslationKey(err))
      }
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = name.trim().length > 0 && phone.trim().length > 0 && !saving

  return (
    <>
      <div className="flex items-center justify-between border-b border-[--color-border] px-4 py-4">
        <h2 className="text-base font-semibold text-[--color-text-primary]">
          {isAdd ? t('registration.customer.add_button') : t('action.edit')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[--color-text-secondary] hover:bg-[--color-surface-raised]"
          aria-label={t('action.close')}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[--color-text-secondary]">
            {t('registration.customer.name_label')}
            <span className="ml-0.5 text-[--color-error]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('field.customer_name.placeholder')}
            required
            className="w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-3 py-2.5 text-sm outline-none focus:border-[--color-primary]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[--color-text-secondary]">
            {t('registration.customer.phone_label')}
            <span className="ml-0.5 text-[--color-error]">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setDupError(false) }}
            placeholder="+91XXXXXXXXXX"
            required
            className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[--color-primary] ${dupError ? 'border-[--color-error] bg-[--color-error-light]' : 'border-[--color-border] bg-[--color-surface]'}`}
          />
          {dupError && (
            <p className="mt-1 text-xs text-[--color-error]" role="alert">
              {t('registration.customer.duplicate_phone_error')}
            </p>
          )}
        </div>

        {isAdd && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[--color-text-secondary]">
              {t('registration.customer.opening_balance_label')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={openingBalanceInput}
              onChange={(e) => setOpeningBalanceInput(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-3 py-2.5 text-sm outline-none focus:border-[--color-primary]"
            />
          </div>
        )}

        {generalError && (
          <p className="text-sm text-[--color-error]" role="alert">{t(generalError)}</p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-3 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
          >
            {saving && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />}
            {t('action.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-[--color-border] bg-[--color-surface] py-3 text-sm font-medium text-[--color-text-secondary]"
          >
            {t('action.cancel')}
          </button>
        </div>
      </form>
    </>
  )
}

function CustomerRow ({ customer, onEdit, onToggleActive, pendingDeactivateId, setPendingDeactivateId, t }) {
  const isPending = pendingDeactivateId === customer.customerId

  const handleDeactivateClick = (event) => {
    event.stopPropagation()
    if (isPending) {
      onToggleActive(customer)
      setPendingDeactivateId(null)
    } else {
      setPendingDeactivateId(customer.customerId)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 divide-y divide-[--color-border] py-3 px-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[--color-text-primary]">{customer.name}</p>
        <p className="text-xs text-[--color-text-secondary]">{customer.phone}</p>
      </div>

      <div className="shrink-0 text-sm font-medium text-[--color-primary]">
        {formatINR(customer.walletBalance ?? 0)}
      </div>

      <div className="shrink-0">
        {customer.active !== false ? (
          <span className="bg-[--color-success-light] text-[--color-success] text-xs rounded-full px-2 py-0.5">
            {t('status.active')}
          </span>
        ) : (
          <span className="bg-[--color-surface-raised] text-[--color-text-secondary] text-xs rounded-full px-2 py-0.5">
            {t('status.inactive')}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(customer)}
          className="rounded-lg p-1.5 text-[--color-text-secondary] hover:bg-[--color-surface-raised]"
          aria-label={t('action.edit')}
        >
          <Pencil size={16} strokeWidth={1.5} />
        </button>

        {isPending ? (
          <button
            type="button"
            onClick={handleDeactivateClick}
            className="rounded-full bg-[--color-error-light] px-2.5 py-1 text-xs font-medium text-[--color-error]"
          >
            {t('registration.confirm_deactivate_label')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDeactivateClick}
            className="rounded-full border border-[--color-border] px-2.5 py-1 text-xs font-medium text-[--color-text-secondary] hover:border-[--color-text-disabled]"
          >
            {customer.active !== false
              ? t('registration.deactivate_label')
              : t('registration.reactivate_label')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function CustomerRegistration () {
  const { t } = useLang()
  const { state } = useWeekState()
  const navigate = useNavigate()

  const [customers, setCustomers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [pendingDeactivateId, setPendingDeactivateId] = useState(null)
  const [toastKey, setToastKey] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((key) => {
    clearTimeout(toastTimer.current)
    setToastKey(key)
    toastTimer.current = setTimeout(() => setToastKey(null), TOAST_DISMISS_MS)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const params = showInactive ? '' : '?active=true'
      const data = await apiGet(`/api/v1/customers${params}`)
      setCustomers(data.customers ?? [])
    } catch (err) {
      setLoadError(apiErrorTranslationKey(err))
    } finally {
      setIsLoading(false)
    }
  }, [showInactive])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // Clear pending deactivate when clicking elsewhere
  const handleContainerClick = useCallback(() => {
    setPendingDeactivateId(null)
  }, [])

  const filtered = customers.filter((c) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    )
  })

  const handleEdit = (customer) => {
    setEditingCustomer(customer)
    setModalMode('edit')
  }

  const handleAdd = () => {
    setEditingCustomer(null)
    setModalMode('add')
  }

  const handleModalClose = () => {
    setModalMode(null)
    setEditingCustomer(null)
  }

  const handleSaved = async () => {
    handleModalClose()
    await loadCustomers()
    showToast('registration.save_success_customer')
  }

  const handleToggleActive = async (customer) => {
    try {
      await apiPatch(`/api/v1/customers/${customer.customerId}`, {
        active: customer.active === false ? true : false,
      })
      await loadCustomers()
    } catch {
      // silent — list will remain unchanged
    }
  }

  return (
    <div
      className="min-h-full bg-[--color-background] p-4 pb-24"
      onClick={handleContainerClick}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/operator/registrations')}
            className="rounded-lg p-1.5 text-[--color-text-secondary] hover:bg-[--color-surface]/60"
            aria-label={t('action.back')}
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <h1 className="text-lg font-semibold text-[--color-text-primary]">
            {t('registration.customer.title')}
          </h1>
          <StateMachineBadge state={state} />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAdd() }}
          className="flex items-center gap-1.5 rounded-xl bg-[--color-primary] px-3 py-2 text-sm font-medium text-[--color-text-inverse]"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          {t('registration.customer.add_button')}
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('wallet.customer_search.placeholder')}
          className="flex-1 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-2.5 text-sm outline-none focus:border-[--color-primary]"
          onClick={(e) => e.stopPropagation()}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[--color-text-secondary]" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-[--color-border] accent-[--color-primary]"
          />
          {t('registration.customer.show_inactive')}
        </label>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-[--color-error-light] bg-[--color-error-light] p-4">
          <p className="text-sm text-[--color-error]">{t(loadError)}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-sm text-[--color-text-secondary]">{t('empty.customer_list')}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[--color-border] bg-[--color-surface] shadow-sm">
          {/* Table header */}
          <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 border-b border-[--color-border] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[--color-text-secondary] sm:grid">
            <span>{t('registration.customer.name_label')} / {t('registration.customer.phone_label')}</span>
            <span className="text-right">{t('wallet.current_balance')}</span>
            <span>{t('status.active')}</span>
            <span className="col-span-2">{t('action.edit')}</span>
          </div>
          {filtered.map((customer) => (
            <CustomerRow
              key={customer.customerId}
              customer={customer}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              pendingDeactivateId={pendingDeactivateId}
              setPendingDeactivateId={(id) => { setPendingDeactivateId(id) }}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Slide-in modal */}
      <SlidePanel open={modalMode !== null} onClose={handleModalClose}>
        {modalMode !== null && (
          <CustomerModal
            mode={modalMode}
            customer={editingCustomer}
            onClose={handleModalClose}
            onSaved={handleSaved}
            t={t}
          />
        )}
      </SlidePanel>

      {/* Toast */}
      {toastKey && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[--color-border] bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-[--color-text-primary]">{t(toastKey)}</p>
        </div>
      )}
    </div>
  )
}
