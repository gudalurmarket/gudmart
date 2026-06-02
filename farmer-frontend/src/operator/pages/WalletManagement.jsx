import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Receipt,
  Users,
  X,
} from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import {
  ActionNotPermittedError,
  apiGet,
  apiPost,
} from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { PAYMENT_CHANNELS, WALLET_TX_TYPES, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR, parseINR } from '../../shared/lib/paise.js'

const TOAST_DISMISS_MS = 6000

const TOPUP_ALLOWED_STATES = new Set([
  WEEK_STATES.SETUP,
  WEEK_STATES.OPEN,
  WEEK_STATES.LOCKED,
  WEEK_STATES.DELIVERY,
  WEEK_STATES.MARKET_DAY,
])

const CREDIT_TX_TYPES = new Set([
  WALLET_TX_TYPES.TOP_UP,
  WALLET_TX_TYPES.ORDER_DEBIT_REVERSAL,
  WALLET_TX_TYPES.PRICE_DIFF_CREDIT,
  WALLET_TX_TYPES.BALANCE_PAYMENT,
])

const TXN_TYPE_LABEL_KEYS = {
  [WALLET_TX_TYPES.TOP_UP]: 'txn.type.top_up',
  [WALLET_TX_TYPES.ORDER_DEBIT]: 'txn.type.order_debit',
  [WALLET_TX_TYPES.ORDER_DEBIT_REVERSAL]: 'txn.type.order_debit_reversal',
  [WALLET_TX_TYPES.PRICE_DIFF_CREDIT]: 'txn.type.price_diff_credit',
  [WALLET_TX_TYPES.PRICE_DIFF_DEBIT]: 'txn.type.price_diff_debit',
  [WALLET_TX_TYPES.CUSTOMER_DUE]: 'txn.type.customer_due',
  [WALLET_TX_TYPES.BALANCE_PAYMENT]: 'txn.type.balance_payment',
  [WALLET_TX_TYPES.MANUAL_ADJUSTMENT]: 'txn.type.manual_adjustment',
}

const CHANNEL_LABEL_KEYS = {
  [PAYMENT_CHANNELS.CASH]: 'channel.cash',
  [PAYMENT_CHANNELS.UPI]: 'channel.upi',
  [PAYMENT_CHANNELS.SYSTEM]: 'channel.system',
}

const CHANNEL_BADGE_CLASS = {
  [PAYMENT_CHANNELS.CASH]: 'bg-[--color-surface-raised] text-[--color-text-secondary]',
  [PAYMENT_CHANNELS.UPI]: 'bg-[--color-info-light] text-[--color-info]',
  [PAYMENT_CHANNELS.SYSTEM]: 'bg-[--color-surface-raised] text-[--color-text-secondary]',
}

function formatLedgerDateTime (isoString, lang) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function isCreditTransaction (txn, chronologicallyOlderTxn) {
  if (txn.type === WALLET_TX_TYPES.MANUAL_ADJUSTMENT) {
    if (
      chronologicallyOlderTxn
      && typeof chronologicallyOlderTxn.runningBalance === 'number'
      && typeof txn.runningBalance === 'number'
    ) {
      return txn.runningBalance > chronologicallyOlderTxn.runningBalance
    }
    if (typeof txn.runningBalance === 'number' && typeof txn.amount === 'number') {
      return txn.runningBalance >= txn.amount
    }
    return true
  }
  return CREDIT_TX_TYPES.has(txn.type)
}

function LedgerRow ({ txn, olderTxn, t, lang }) {
  const credit = isCreditTransaction(txn, olderTxn)
  const typeKey = TXN_TYPE_LABEL_KEYS[txn.type]
  const typeLabel = typeKey ? t(typeKey) : txn.type
  const channelKey = txn.channel ? CHANNEL_LABEL_KEYS[txn.channel] : null
  const amountPaise = typeof txn.amount === 'number' ? txn.amount : 0
  const runningBalance = txn.runningBalance ?? txn.running_balance

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[--color-text-primary]">{typeLabel}</p>
          {channelKey && (
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_BADGE_CLASS[txn.channel] ?? 'bg-[--color-surface-raised] text-[--color-text-secondary]'}`}
            >
              {t(channelKey)}
            </span>
          )}
          {(txn.referenceNote ?? txn.reference_note) && (
            <p className="mt-1 text-xs text-[--color-text-secondary]">
              {txn.referenceNote ?? txn.reference_note}
            </p>
          )}
          <p className="mt-1 text-xs text-[--color-text-disabled]">
            {formatLedgerDateTime(txn.createdAt ?? txn.created_at, lang)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-semibold ${credit ? 'text-[--color-primary]' : 'text-[--color-error]'}`}
          >
            {credit ? '+' : '−'}
            {formatINR(amountPaise)}
          </p>
          {typeof runningBalance === 'number' && (
            <p className="mt-0.5 text-xs text-[--color-text-secondary]">
              {t('wallet.ledger.running_balance')}
              {': '}
              {formatINR(runningBalance)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function PendingOrdersPrompt ({ count, t, onDismiss, onGoToOrders }) {
  return (
    <div className="rounded-xl border border-[--color-warning-light] bg-[--color-warning-light] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[--color-warning]">
            {t('wallet.pending_orders_now_coverable')}
            {' '}
            <span className="font-semibold">({count})</span>
          </p>
          <button
            type="button"
            onClick={onGoToOrders}
            className="mt-2 text-sm font-medium text-[--color-primary] underline"
          >
            {t('wallet.go_to_orders')}
          </button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-[--color-warning] hover:bg-[--color-warning-light]"
          aria-label={t('action.close')}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function TopUpForm ({
  t,
  activeWeekId,
  onSubmit,
  submitting,
  submitErrorKey,
}) {
  const [amountInput, setAmountInput] = useState('')
  const [channel, setChannel] = useState(PAYMENT_CHANNELS.CASH)
  const [referenceNote, setReferenceNote] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const amountPaise = parseINR(amountInput)
    if (amountPaise == null || amountPaise <= 0) return
    const ok = await onSubmit({
      amountPaise,
      channel,
      referenceNote: channel === PAYMENT_CHANNELS.UPI ? referenceNote.trim() : undefined,
    })
    if (ok) {
      setAmountInput('')
      setReferenceNote('')
      setChannel(PAYMENT_CHANNELS.CASH)
    }
  }

  const amountPaise = parseINR(amountInput)
  const amountValid = amountPaise != null && amountPaise > 0
  const canSubmit = activeWeekId && amountValid && !submitting

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[--color-text-secondary]">
          {t('wallet.topup.amount_label')}
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder={t('wallet.topup.amount_placeholder')}
          className="w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-3 py-2.5 text-sm outline-none focus:border-[--color-primary]"
          required
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[--color-text-secondary]">
          {t('wallet.topup.channel_label')}
        </p>
        <div className="flex gap-2">
          {[PAYMENT_CHANNELS.CASH, PAYMENT_CHANNELS.UPI].map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                channel === ch
                  ? 'bg-[--color-primary] text-[--color-text-inverse]'
                  : 'border border-[--color-border] bg-[--color-surface] text-[--color-text-secondary]'
              }`}
            >
              {t(ch === PAYMENT_CHANNELS.CASH ? 'wallet.channel.cash' : 'wallet.channel.upi')}
            </button>
          ))}
        </div>
      </div>

      {channel === PAYMENT_CHANNELS.UPI && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[--color-text-secondary]">
            {t('wallet.topup.reference_label')}
          </label>
          <input
            type="text"
            value={referenceNote}
            onChange={(e) => setReferenceNote(e.target.value)}
            placeholder={t('wallet.topup.reference_placeholder')}
            className="w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-3 py-2.5 text-sm outline-none focus:border-[--color-primary]"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-3 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
      >
        {submitting && <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />}
        {t('wallet.topup.submit_button')}
      </button>

      {submitErrorKey && (
        <p className="text-sm text-[--color-error]" role="alert">
          {t(submitErrorKey)}
        </p>
      )}
    </form>
  )
}

function CustomerWalletDetail ({
  customerId,
  customerName,
  currentState,
  activeWeekId,
  topUpAllowed,
  t,
  lang,
  onBack,
  onToast,
}) {
  const navigate = useNavigate()
  const [walletBalance, setWalletBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErrorKey, setLoadErrorKey] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitErrorKey, setSubmitErrorKey] = useState(null)
  const [pendingCoverable, setPendingCoverable] = useState(null)

  const loadWallet = useCallback(async () => {
    setLoading(true)
    setLoadErrorKey(null)
    try {
      const data = await apiGet(`/api/v1/customers/${customerId}/wallet`)
      setWalletBalance(data.walletBalance ?? 0)
      setTransactions(data.transactions ?? [])
    } catch (err) {
      setLoadErrorKey(apiErrorTranslationKey(err))
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    loadWallet()
  }, [loadWallet])

  const handleTopUp = useCallback(
    async ({ amountPaise, channel, referenceNote }) => {
      setSubmitting(true)
      setSubmitErrorKey(null)
      try {
        const body = {
          amount: amountPaise,
          channel,
          weekId: activeWeekId,
        }
        if (referenceNote) body.referenceNote = referenceNote

        const result = await apiPost(
          `/api/v1/customers/${customerId}/wallet/topup`,
          body,
        )

        setWalletBalance(result.walletBalance ?? 0)

        if (result.txnId) {
          const newTxn = {
            txnId: result.txnId,
            type: WALLET_TX_TYPES.TOP_UP,
            amount: amountPaise,
            channel,
            runningBalance: result.walletBalance,
            referenceNote: referenceNote ?? null,
            createdAt: new Date().toISOString(),
          }
          setTransactions((prev) => [newTxn, ...prev])
        } else {
          await loadWallet()
        }

        const coverable = result.pendingOrdersNowCoverable ?? []
        if (coverable.length > 0) {
          setPendingCoverable(coverable)
        } else {
          setPendingCoverable(null)
        }

        onToast('toast.topup_recorded')
        return true
      } catch (err) {
        if (err instanceof ActionNotPermittedError) {
          setSubmitErrorKey('error.action_not_permitted_in_state')
        } else {
          setSubmitErrorKey(apiErrorTranslationKey(err))
        }
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [activeWeekId, customerId, loadWallet, onToast],
  )

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg p-1 text-[--color-text-secondary] hover:bg-[--color-surface]/60"
        >
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
        <h1 className="flex-1 text-lg font-semibold text-[--color-text-primary]">
          {customerName || customerId}
        </h1>
        <StateMachineBadge state={currentState} />
      </div>

      {loadErrorKey && (
        <p className="text-sm text-[--color-error]" role="alert">
          {t(loadErrorKey)}
        </p>
      )}

      <div className="rounded-2xl border border-[--color-border] bg-[--color-surface] p-6">
        <p className="text-sm text-[--color-text-secondary]">{t('wallet.current_balance')}</p>
        <p
          className={`mt-1 text-4xl font-bold ${
            walletBalance > 0 ? 'text-[--color-primary]' : 'text-[--color-text-disabled]'
          }`}
        >
          {formatINR(walletBalance)}
        </p>
      </div>

      {topUpAllowed ? (
        <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
          <h2 className="mb-4 text-base font-semibold text-[--color-text-primary]">
            {t('wallet.topup.title')}
          </h2>
          <TopUpForm
            t={t}
            activeWeekId={activeWeekId}
            onSubmit={handleTopUp}
            submitting={submitting}
            submitErrorKey={submitErrorKey}
          />
          {pendingCoverable && pendingCoverable.length > 0 && (
            <div className="mt-4">
              <PendingOrdersPrompt
                count={pendingCoverable.length}
                t={t}
                onDismiss={() => setPendingCoverable(null)}
                onGoToOrders={() => navigate('/operator/orders?filter=pending_payment')}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-[--color-text-secondary]">{t('wallet.topup_not_available')}</p>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-[--color-text-primary]">
          {t('wallet.ledger.title')}
        </h2>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Receipt size={28} strokeWidth={1.5} className="text-[--color-text-disabled]" />
            <p className="mt-2 text-sm text-[--color-text-secondary]">{t('wallet.ledger.empty')}</p>
          </div>
        ) : (
          transactions.map((txn, index) => (
            <LedgerRow
              key={txn.txnId ?? txn.txn_id ?? `${txn.createdAt}-${index}`}
              txn={txn}
              olderTxn={transactions[index + 1]}
              t={t}
              lang={lang}
            />
          ))
        )}
      </section>
    </div>
  )
}

function CustomerList ({
  customers,
  searchQuery,
  onSearchChange,
  currentState,
  t,
  onSelectCustomer,
}) {
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const active = customers.filter((c) => c.active !== false)
    const sorted = [...active].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
    )
    if (!q) return sorted
    return sorted.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(q)
        || (c.phone ?? '').toLowerCase().includes(q),
    )
  }, [customers, searchQuery])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-[--color-text-primary]">{t('wallet.page_title')}</h1>
        <StateMachineBadge state={currentState} />
      </div>

      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t('wallet.customer_search.placeholder')}
        className="w-full rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-2.5 text-sm outline-none focus:border-[--color-primary]"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Users size={32} strokeWidth={1.5} className="text-[--color-text-disabled]" />
          <p className="mt-3 text-sm text-[--color-text-secondary]">{t('wallet.no_customers')}</p>
        </div>
      ) : (
        <ul className="list-none p-0">
          {filtered.map((customer) => {
            const balance = customer.walletBalance ?? 0
            return (
              <li key={customer.customerId}>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(customer.customerId)}
                  className="mb-2 flex w-full items-center justify-between rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[--color-text-primary]">{customer.name}</p>
                    <p className="text-xs text-[--color-text-secondary]">{customer.phone}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-sm ${
                        balance > 0
                          ? 'font-semibold text-[--color-primary]'
                          : 'text-[--color-text-disabled]'
                      }`}
                    >
                      {formatINR(balance)}
                    </span>
                    <ChevronRight size={16} strokeWidth={1.5} className="text-[--color-text-disabled]" />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function WalletManagement () {
  const { t, lang } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const customerId = searchParams.get('customerId')

  const [currentState, setCurrentState] = useState(null)
  const [activeWeekId, setActiveWeekId] = useState(null)
  const [weekLoading, setWeekLoading] = useState(true)

  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [customersErrorKey, setCustomersErrorKey] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [toastKey, setToastKey] = useState(null)

  const topUpAllowed = currentState != null && TOPUP_ALLOWED_STATES.has(currentState)

  useEffect(() => {
    if (!toastKey) return undefined
    const timer = setTimeout(() => setToastKey(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toastKey])

  const loadWeek = useCallback(async () => {
    setWeekLoading(true)
    try {
      const data = await apiGet('/api/v1/weeks')
      const active = pickActiveWeek(data.weeks ?? [])
      if (active) {
        setActiveWeekId(active.weekId ?? active.week_id ?? null)
        setCurrentState(active.state ?? null)
      } else {
        setActiveWeekId(null)
        setCurrentState(null)
      }
    } catch {
      setActiveWeekId(null)
      setCurrentState(null)
    } finally {
      setWeekLoading(false)
    }
  }, [])

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true)
    setCustomersErrorKey(null)
    try {
      const data = await apiGet('/api/v1/customers')
      setCustomers(data.customers ?? [])
    } catch (err) {
      setCustomersErrorKey(apiErrorTranslationKey(err))
      setCustomers([])
    } finally {
      setCustomersLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const customerName = useMemo(() => {
    if (!customerId) return ''
    const found = customers.find((c) => c.customerId === customerId)
    return found?.name ?? ''
  }, [customers, customerId])

  const handleSelectCustomer = (id) => {
    setSearchParams({ customerId: id })
  }

  const handleBack = () => {
    setSearchParams({})
    setSearchQuery('')
  }

  if (weekLoading || (!customerId && customersLoading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[--color-background] p-4 pb-24">
      {customersErrorKey && !customerId && (
        <p className="mb-4 text-sm text-[--color-error]" role="alert">
          {t(customersErrorKey)}
        </p>
      )}

      {customerId ? (
        <CustomerWalletDetail
          customerId={customerId}
          customerName={customerName}
          currentState={currentState}
          activeWeekId={activeWeekId}
          topUpAllowed={topUpAllowed}
          t={t}
          lang={lang}
          onBack={handleBack}
          onToast={setToastKey}
        />
      ) : (
        <CustomerList
          customers={customers}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentState={currentState}
          t={t}
          onSelectCustomer={handleSelectCustomer}
        />
      )}

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
