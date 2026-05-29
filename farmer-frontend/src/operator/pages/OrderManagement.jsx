import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle,
  PackageOpen,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiDelete, apiGet, apiPatch } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { ORDER_STATUS, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR, formatINROptional } from '../../shared/lib/paise.js'

const TOAST_DISMISS_MS = 6000

const STATUS_FILTERS = [
  { id: 'all', status: null, labelKey: 'order.filter.all', fallbackKey: 'nav.order_management' },
  {
    id: 'confirmed',
    status: ORDER_STATUS.CONFIRMED,
    labelKey: 'order.filter.confirmed',
    fallbackKey: 'order.status.confirmed',
  },
  {
    id: 'pending_payment',
    status: ORDER_STATUS.PENDING_PAYMENT,
    labelKey: 'order.filter.pending_payment',
    fallbackKey: 'order.status.pending_payment',
  },
  {
    id: 'cancelled',
    status: ORDER_STATUS.CANCELLED,
    labelKey: 'order.filter.cancelled',
    fallbackKey: 'order.status.cancelled',
  },
]

const STATUS_BADGE = {
  [ORDER_STATUS.CONFIRMED]: {
    className: 'bg-green-100 text-green-700',
    labelKey: 'status.confirmed',
    fallbackKey: 'order.status.confirmed',
  },
  [ORDER_STATUS.PENDING_PAYMENT]: {
    className: 'bg-amber-100 text-amber-700',
    labelKey: 'status.pending_payment',
    fallbackKey: 'order.status.pending_payment',
  },
  [ORDER_STATUS.CANCELLED]: {
    className: 'bg-gray-100 text-gray-500',
    labelKey: 'status.cancelled',
    fallbackKey: 'order.status.cancelled',
  },
}

function translateWithFallback (t, primaryKey, fallbackKey) {
  const primary = t(primaryKey)
  if (primary !== primaryKey) return primary
  return fallbackKey ? t(fallbackKey) : primary
}

function formatRelativeTime (isoString, lang) {
  if (!isoString) return ''
  const then = new Date(isoString).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((then - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang === 'ta' ? 'ta' : 'en', { numeric: 'auto' })
  const divisions = [
    { unit: 'year', seconds: 60 * 60 * 24 * 365 },
    { unit: 'month', seconds: 60 * 60 * 24 * 30 },
    { unit: 'day', seconds: 60 * 60 * 24 },
    { unit: 'hour', seconds: 60 * 60 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ]
  for (const { unit, seconds } of divisions) {
    if (Math.abs(diffSec) >= seconds || unit === 'second') {
      return rtf.format(Math.round(diffSec / seconds), unit)
    }
  }
  return ''
}

function formatFullDateTime (isoString, lang) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getCustomerName (order) {
  return order.customerName ?? order.customer_name ?? order.customerId ?? ''
}

function getCustomerPhone (order) {
  return order.customerPhone ?? order.customer_phone ?? order.phone ?? null
}

function getWalletBalance (order) {
  const balance = order.walletBalance ?? order.wallet_balance
  return typeof balance === 'number' && Number.isInteger(balance) ? balance : null
}

function getOrderValue (order) {
  const value = order.orderValue ?? order.order_value
  if (typeof value === 'number' && Number.isInteger(value)) return value
  let sum = 0
  let hasLineValue = false
  for (const li of order.lineItems ?? order.line_items ?? []) {
    const lineValue = li.lineValue ?? li.line_value
    if (typeof lineValue === 'number' && Number.isInteger(lineValue)) {
      sum += lineValue
      hasLineValue = true
    }
  }
  return hasLineValue ? sum : null
}

function lineItemsHaveValues (lineItems) {
  return (lineItems ?? []).some(
    (li) => typeof li.lineValue === 'number' || typeof li.line_value === 'number',
  )
}

function getLineValue (lineItem) {
  if (typeof lineItem.lineValue === 'number') return lineItem.lineValue
  if (typeof lineItem.line_value === 'number') return lineItem.line_value
  return null
}

function productDisplayName (productId, produceById, lang) {
  const item = produceById.get(productId)
  if (!item) return productId
  if (lang === 'ta' && item.nameTa) return item.nameTa
  return item.nameEn ?? productId
}

function StatusBadge ({ status, t }) {
  const config = STATUS_BADGE[status]
  if (!config) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        {status}
      </span>
    )
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {translateWithFallback(t, config.labelKey, config.fallbackKey)}
    </span>
  )
}

function CancelModal ({
  open,
  title,
  body,
  cancelLabel,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-2 text-gray-600 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-red-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditOrderModal ({
  open,
  order,
  weekId,
  produceItems,
  produceLoading,
  saving,
  errorKey,
  t,
  lang,
  onClose,
  onSave,
  onLoadProduce,
}) {
  const [rows, setRows] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [addProductId, setAddProductId] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addUnit, setAddUnit] = useState('')
  const [productSearch, setProductSearch] = useState('')

  useEffect(() => {
    if (!open || !order) return
    setRows(
      (order.lineItems ?? []).map((li, index) => ({
        localId: li.lineItemId ?? `row-${index}`,
        productId: li.productId,
        productLabel: li.productName ?? li.productId,
        orderedQty: String(li.orderedQty ?? ''),
        unit: li.unit ?? '',
      })),
    )
    setShowAddForm(false)
    setAddProductId('')
    setAddQty('')
    setAddUnit('')
    setProductSearch('')
    onLoadProduce()
  }, [open, order, onLoadProduce])

  if (!open || !order) return null

  const produceById = new Map(produceItems.map((p) => [p.productId, p]))

  const productLabel = (item) =>
    lang === 'ta' && item.nameTa ? item.nameTa : item.nameEn ?? item.productId

  const filteredProduce = produceItems.filter((item) => {
    if (!productSearch.trim()) return true
    const q = productSearch.trim().toLowerCase()
    return (
      (item.nameEn ?? '').toLowerCase().includes(q)
      || (item.nameTa ?? '').toLowerCase().includes(q)
    )
  })

  const updateRow = (index, patch) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  const removeRow = (index) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddLine = () => {
    const produce = produceById.get(addProductId)
    if (!addProductId || !addQty || !addUnit) return
    const qty = Number(addQty)
    if (!Number.isFinite(qty) || qty <= 0) return
    setRows((prev) => [
      ...prev,
      {
        localId: `new-${Date.now()}`,
        productId: addProductId,
        productLabel: produce ? productLabel(produce) : addProductId,
        orderedQty: String(qty),
        unit: addUnit,
      },
    ])
    setShowAddForm(false)
    setAddProductId('')
    setAddQty('')
    setAddUnit('')
    setProductSearch('')
  }

  const handleSave = () => {
    const lineItems = rows
      .map((row) => ({
        productId: row.productId,
        orderedQty: Number(row.orderedQty),
        unit: row.unit,
      }))
      .filter(
        (li) =>
          li.productId
          && li.unit
          && Number.isFinite(li.orderedQty)
          && li.orderedQty > 0,
      )
    if (lineItems.length < 1) return
    onSave(lineItems)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {translateWithFallback(t, 'order.edit.title', 'action.edit')}
          {' — '}
          {getCustomerName(order)}
        </h2>

        {errorKey && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {t(errorKey)}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {produceLoading && rows.length > 0 ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            rows.map((row, index) => {
              const produce = produceById.get(row.productId)
              const name =
                produce != null
                  ? productLabel(produce)
                  : row.productLabel ?? row.productId
              return (
                <div
                  key={row.localId}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-[#E8E4DF] p-3"
                >
                  <div className="min-w-[120px] flex-1">
                    <p className="text-xs text-gray-500">{t('field.product')}</p>
                    <p className="text-sm font-medium text-gray-800">{name}</p>
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-gray-500">{t('field.quantity')}</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.orderedQty}
                      onChange={(e) =>
                        updateRow(index, { orderedQty: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="w-20">
                    <p className="text-xs text-gray-500">{t('field.unit')}</p>
                    <p className="mt-1 text-sm text-gray-700">
                      {row.unit ? t(`unit.${row.unit}`) : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= 1}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-red-400 disabled:opacity-30"
                    aria-label={t('action.delete')}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {!showAddForm ? (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mt-3 text-sm font-medium text-[#2D5A1B]"
          >
            {translateWithFallback(t, 'action.add_line_item', 'intake.add_line_item')}
          </button>
        ) : (
          <div className="mt-3 space-y-2 rounded-lg border border-dashed border-[#E8E4DF] p-3">
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder={t('action.search')}
              className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm"
            />
            <select
              value={addProductId}
              onChange={(e) => {
                const id = e.target.value
                const produce = produceById.get(id)
                setAddProductId(id)
                setAddUnit(produce?.unit ?? '')
              }}
              className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm"
            >
              <option value="">— {t('field.product')} —</option>
              {filteredProduce.map((item) => (
                <option key={item.productId} value={item.productId}>
                  {productLabel(item)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="any"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder={t('field.quantity')}
                className="flex-1 rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm"
              />
              <select
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value)}
                className="w-28 rounded-lg border border-[#E8E4DF] px-2 py-2 text-sm"
              >
                <option value="">—</option>
                {addProductId && produceById.get(addProductId)?.unit && (
                  <option value={produceById.get(addProductId).unit}>
                    {t(`unit.${produceById.get(addProductId).unit}`)}
                  </option>
                )}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded-lg border border-[#E8E4DF] py-2 text-sm text-gray-600"
              >
                {t('action.cancel')}
              </button>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex-1 rounded-lg bg-[#2D5A1B] py-2 text-sm text-white"
              >
                {t('action.add')}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-[#E8E4DF] py-2.5 text-gray-600 disabled:opacity-60"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || produceLoading}
            className="flex-1 rounded-xl bg-[#2D5A1B] py-2.5 text-white disabled:opacity-60"
          >
            {saving ? t('action.loading') : t('action.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderDetail ({
  order,
  currentState,
  produceById,
  lang,
  t,
  onEdit,
  onCancel,
}) {
  const showValueColumn = lineItemsHaveValues(order.lineItems)
  const walletBalance = getWalletBalance(order)
  const canAct =
    currentState === WEEK_STATES.OPEN
    && order.status === ORDER_STATUS.CONFIRMED
  const canConfirm =
    currentState === WEEK_STATES.OPEN
    && order.status === ORDER_STATUS.PENDING_PAYMENT

  return (
    <div className="mt-3 border-t border-[#E8E4DF] pt-3">
      <div className="space-y-1 text-sm">
        <p className="font-medium text-gray-800">{getCustomerName(order)}</p>
        {getCustomerPhone(order) && (
          <p className="text-gray-500">{getCustomerPhone(order)}</p>
        )}
        <p className="text-gray-500">
          {formatFullDateTime(order.fcfsTimestamp, lang)}
        </p>
        <StatusBadge status={order.status} t={t} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#E8E4DF] text-xs text-gray-500">
              <th className="pb-2 pr-2 font-medium">{t('field.product')}</th>
              <th className="pb-2 pr-2 font-medium">{t('field.quantity')}</th>
              <th className="pb-2 pr-2 font-medium">{t('field.unit')}</th>
              {showValueColumn && (
                <th className="pb-2 font-medium">{t('field.amount')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(order.lineItems ?? []).map((li) => {
              const lineValue = getLineValue(li)
              return (
                <tr key={li.lineItemId ?? `${li.productId}-${li.orderedQty}`} className="border-b border-[#E8E4DF]/60">
                  <td className="py-2 pr-2 text-gray-800">
                    {productDisplayName(li.productId, produceById, lang)}
                  </td>
                  <td className="py-2 pr-2 text-gray-700">{li.orderedQty}</td>
                  <td className="py-2 pr-2 text-gray-700">
                    {li.unit ? t(`unit.${li.unit}`) : '—'}
                  </td>
                  {showValueColumn && (
                    <td className="py-2 text-gray-700">
                      {lineValue != null ? formatINR(lineValue) : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <p>
          <span className="text-gray-500">{t('summary.total_label')}: </span>
          <span className="font-semibold text-[#2D5A1B]">
            {formatINROptional(getOrderValue(order))}
          </span>
        </p>
        {walletBalance != null && (
          <p className="text-gray-600">{formatINR(walletBalance)}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canAct && (
          <>
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#E8E4DF] bg-white px-3 py-2 text-sm font-medium text-gray-700"
            >
              <Pencil size={16} strokeWidth={1.5} />
              {translateWithFallback(t, 'action.edit_order', 'action.edit')}
            </button>
            <button
              type="button"
              onClick={() => onCancel(order)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#E8E4DF] bg-white px-3 py-2 text-sm font-medium text-red-500"
            >
              <X size={16} strokeWidth={1.5} />
              {translateWithFallback(t, 'action.cancel_order', 'action.cancel')}
            </button>
          </>
        )}
        {canConfirm && (
          <button
            type="button"
            disabled
            title={t('order.confirm_via_topup_tooltip')}
            className="inline-flex min-h-[44px] cursor-not-allowed items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 opacity-50"
          >
            <CheckCircle size={16} strokeWidth={1.5} className="text-green-600" />
            {t('action.confirm_order')}
          </button>
        )}
      </div>
    </div>
  )
}

function OrderCard ({
  order,
  expanded,
  currentState,
  produceById,
  lang,
  t,
  onToggle,
  onEdit,
  onCancel,
}) {
  return (
    <div className="rounded-xl border border-[#E8E4DF] bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => onToggle(order.orderId)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">{getCustomerName(order)}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatRelativeTime(order.fcfsTimestamp, lang)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-semibold text-[#2D5A1B]">
            {formatINROptional(getOrderValue(order))}
          </p>
          <StatusBadge status={order.status} t={t} />
        </div>
      </button>
      {expanded && (
        <OrderDetail
          order={order}
          currentState={currentState}
          produceById={produceById}
          lang={lang}
          t={t}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

function PendingPaymentRow ({ order, currentState, t }) {
  const walletBalance = getWalletBalance(order)
  const orderValue = getOrderValue(order)
  const shortfall =
    orderValue != null && walletBalance != null && orderValue > walletBalance
      ? orderValue - walletBalance
      : null
  const canConfirm =
    currentState === WEEK_STATES.OPEN
    && order.status === ORDER_STATUS.PENDING_PAYMENT

  return (
    <div className="mb-2 rounded-xl border border-[#E8E4DF] bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">{getCustomerName(order)}</p>
          <p className="mt-1 font-semibold text-[#2D5A1B]">
            {formatINROptional(orderValue)}
          </p>
        </div>
        <div className="text-right text-sm">
          {walletBalance != null && (
            <p className="text-gray-500">{formatINR(walletBalance)}</p>
          )}
          {shortfall != null && shortfall > 0 && (
            <p className="mt-1 text-amber-600">
              {translateWithFallback(t, 'order.shortfall_label', 'intake.shortfall_amount')}
              {': '}
              {formatINR(shortfall)}
            </p>
          )}
        </div>
      </div>
      {canConfirm && (
        <button
          type="button"
          disabled
          title={t('order.confirm_via_topup_tooltip')}
          className="mt-3 inline-flex min-h-[44px] w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-green-50 py-2 text-sm font-medium text-green-700 opacity-50"
        >
          <CheckCircle size={16} strokeWidth={1.5} className="text-green-600" />
          {t('action.confirm_order')}
        </button>
      )}
    </div>
  )
}

function AggregatedSummary ({ orders, produceById, lang, t }) {
  const rows = useMemo(() => {
    const map = new Map()
    for (const order of orders) {
      if (order.status !== ORDER_STATUS.CONFIRMED) continue
      for (const li of order.lineItems ?? []) {
        const key = li.productId
        if (!key) continue
        const existing = map.get(key) ?? {
          productId: key,
          totalQty: 0,
          unit: li.unit,
        }
        existing.totalQty += Number(li.orderedQty) || 0
        existing.unit = li.unit ?? existing.unit
        map.set(key, existing)
      }
    }
    return [...map.values()].sort((a, b) => {
      const nameA = productDisplayName(a.productId, produceById, lang)
      const nameB = productDisplayName(b.productId, produceById, lang)
      return nameA.localeCompare(nameB, lang === 'ta' ? 'ta' : 'en')
    })
  }, [orders, produceById, lang])

  if (rows.length === 0) return null

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-800">
        {translateWithFallback(t, 'order.summary.title', 'nav.order_management')}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-[#E8E4DF] bg-white p-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#E8E4DF] text-xs text-gray-500">
              <th className="pb-2 pr-4 font-medium">{t('field.product')}</th>
              <th className="pb-2 pr-4 font-medium">{t('field.quantity')}</th>
              <th className="pb-2 font-medium">{t('field.unit')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-b border-[#E8E4DF]/60 last:border-0">
                <td className="py-2 pr-4 text-gray-800">
                  {productDisplayName(row.productId, produceById, lang)}
                </td>
                <td className="py-2 pr-4 text-gray-700">{row.totalQty}</td>
                <td className="py-2 text-gray-700">
                  {row.unit ? t(`unit.${row.unit}`) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function OrderManagement () {
  const { lang, t } = useLang()
  const [searchParams] = useSearchParams()

  const [mainTab, setMainTab] = useState('orders')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedOrderId, setExpandedOrderId] = useState(null)

  const [weekId, setWeekId] = useState(null)
  const [currentState, setCurrentState] = useState(null)
  const [marketDate, setMarketDate] = useState(null)
  const [orders, setOrders] = useState([])

  const [loading, setLoading] = useState(true)
  const [loadErrorKey, setLoadErrorKey] = useState(null)

  const [produceItems, setProduceItems] = useState([])
  const [produceLoading, setProduceLoading] = useState(false)
  const [produceLoaded, setProduceLoaded] = useState(false)

  const [editOrder, setEditOrder] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editErrorKey, setEditErrorKey] = useState(null)

  const [cancelOrder, setCancelOrder] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (searchParams.get('filter') === 'pending_payment') {
      setMainTab('pending_payment')
    }
  }, [searchParams])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const fetchOrders = useCallback(async (activeWeekId) => {
    const data = await apiGet(`/api/v1/weeks/${activeWeekId}/orders`)
    setOrders(data.orders ?? [])
  }, [])

  const loadWeekAndOrders = useCallback(async () => {
    setLoading(true)
    setLoadErrorKey(null)
    try {
      const weeksData = await apiGet('/api/v1/weeks')
      const active = pickActiveWeek(weeksData.weeks ?? [])
      if (!active) {
        setWeekId(null)
        setCurrentState(null)
        setMarketDate(null)
        setOrders([])
        return
      }
      const id = active.weekId ?? active.week_id
      setWeekId(id)
      setCurrentState(active.state)
      setMarketDate(active.marketDate ?? active.market_date)
      await fetchOrders(id)
    } catch (err) {
      setLoadErrorKey(apiErrorTranslationKey(err))
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [fetchOrders])

  useEffect(() => {
    loadWeekAndOrders()
  }, [loadWeekAndOrders])

  const loadProduce = useCallback(async () => {
    if (!weekId || produceLoaded) return
    setProduceLoading(true)
    try {
      const data = await apiGet(`/api/v1/weeks/${weekId}/produce`)
      setProduceItems(data.items ?? [])
      setProduceLoaded(true)
    } catch (err) {
      setEditErrorKey(apiErrorTranslationKey(err))
    } finally {
      setProduceLoading(false)
    }
  }, [weekId, produceLoaded])

  const produceById = useMemo(
    () => new Map(produceItems.map((p) => [p.productId, p])),
    [produceItems],
  )

  const filterCounts = useMemo(() => {
    const counts = { all: orders.length, confirmed: 0, pending_payment: 0, cancelled: 0 }
    for (const order of orders) {
      if (order.status === ORDER_STATUS.CONFIRMED) counts.confirmed += 1
      if (order.status === ORDER_STATUS.PENDING_PAYMENT) counts.pending_payment += 1
      if (order.status === ORDER_STATUS.CANCELLED) counts.cancelled += 1
    }
    return counts
  }, [orders])

  const filteredOrders = useMemo(() => {
    const filterDef = STATUS_FILTERS.find((f) => f.id === statusFilter)
    let list = orders
    if (filterDef?.status) {
      list = list.filter((o) => o.status === filterDef.status)
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((o) => getCustomerName(o).toLowerCase().includes(q))
  }, [orders, statusFilter, searchQuery])

  const pendingPaymentOrders = useMemo(
    () => orders.filter((o) => o.status === ORDER_STATUS.PENDING_PAYMENT),
    [orders],
  )

  const showSummary =
    currentState === WEEK_STATES.OPEN || currentState === WEEK_STATES.LOCKED

  const handleToggleExpand = (orderId) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId))
  }

  const handleSaveEdit = async (lineItems) => {
    if (!weekId || !editOrder) return
    setEditSaving(true)
    setEditErrorKey(null)
    try {
      const result = await apiPatch(
        `/api/v1/weeks/${weekId}/orders/${editOrder.orderId}`,
        { lineItems },
      )
      await fetchOrders(weekId)
      setEditOrder(null)
      if (result.status === ORDER_STATUS.PENDING_PAYMENT) {
        setToast({ key: 'toast.order_reverted_pending_payment' })
      } else {
        setToast({ key: 'toast.order_updated', fallbackKey: 'toast.order_confirmed' })
      }
    } catch (err) {
      setEditErrorKey(apiErrorTranslationKey(err))
    } finally {
      setEditSaving(false)
    }
  }

  const handleCancelConfirm = async () => {
    if (!weekId || !cancelOrder) return
    setCancelLoading(true)
    try {
      const result = await apiDelete(
        `/api/v1/weeks/${weekId}/orders/${cancelOrder.orderId}`,
      )
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === cancelOrder.orderId
            ? { ...o, status: ORDER_STATUS.CANCELLED }
            : o,
        ),
      )
      let message = t('toast.order_cancelled')
      const reversed = result.walletReversed ?? 0
      if (reversed > 0) {
        message += ` — ${formatINR(reversed)} ${translateWithFallback(t, 'toast.wallet_credited', 'summary.wallet_credits')}`
      }
      setToast({ message })
      setCancelOrder(null)
      setExpandedOrderId(null)
    } catch {
      setToast({ key: 'error.unknown' })
    } finally {
      setCancelLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#F0EDE8]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full space-y-4 bg-[#F0EDE8] pb-8">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <StateMachineBadge state={currentState} />
        {marketDate && (
          <p className="text-right text-sm text-gray-600">
            {formatMarketDate(marketDate, lang)}
          </p>
        )}
      </header>

      {currentState !== WEEK_STATES.OPEN && (
        <p className="text-sm text-amber-600">
          {translateWithFallback(t, 'order.read_only_notice', 'error.action_not_permitted_in_state')}
        </p>
      )}

      {loadErrorKey && (
        <div
          className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700"
          role="alert"
        >
          {t(loadErrorKey)}
        </div>
      )}

      {!loadErrorKey && !weekId && (
        <div className="rounded-xl border border-[#E8E4DF] bg-white p-4 text-sm text-gray-600">
          {t('error.week_not_found')}
        </div>
      )}

      {weekId && !loadErrorKey && (
        <>
          <div className="flex gap-1 rounded-xl border border-[#E8E4DF] bg-white p-1">
            <button
              type="button"
              onClick={() => setMainTab('orders')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mainTab === 'orders'
                  ? 'bg-[#2D5A1B] text-white'
                  : 'text-gray-600'
              }`}
            >
              {t('nav.order_management')}
            </button>
            <button
              type="button"
              onClick={() => setMainTab('pending_payment')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mainTab === 'pending_payment'
                  ? 'bg-[#2D5A1B] text-white'
                  : 'text-gray-600'
              }`}
            >
              {t('order.status.pending_payment')}
              {filterCounts.pending_payment > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  {filterCounts.pending_payment}
                </span>
              )}
            </button>
          </div>

          {mainTab === 'orders' && (
            <div className="space-y-3">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={translateWithFallback(
                  t,
                  'order.search.placeholder',
                  'action.search',
                )}
                className="w-full rounded-xl border border-[#E8E4DF] bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400"
              />

              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((filter) => {
                  const active = statusFilter === filter.id
                  const count = filterCounts[filter.id] ?? 0
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setStatusFilter(filter.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[#2D5A1B] text-white'
                          : 'border border-[#E8E4DF] bg-white text-gray-600'
                      }`}
                    >
                      {translateWithFallback(t, filter.labelKey, filter.fallbackKey)}
                      <span
                        className={`rounded-full px-1.5 text-xs ${
                          active ? 'bg-white/20' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[#E8E4DF] bg-white py-16">
                  <PackageOpen size={32} strokeWidth={1.5} className="text-gray-300" />
                  <p className="mt-3 text-sm text-gray-500">
                    {translateWithFallback(t, 'order.empty_state', 'empty.order_list')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.orderId}
                      order={order}
                      expanded={expandedOrderId === order.orderId}
                      currentState={currentState}
                      produceById={produceById}
                      lang={lang}
                      t={t}
                      onToggle={handleToggleExpand}
                      onEdit={setEditOrder}
                      onCancel={setCancelOrder}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {mainTab === 'pending_payment' && (
            <div>
              {pendingPaymentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[#E8E4DF] bg-white py-16">
                  <CheckCircle size={32} strokeWidth={1.5} className="text-green-400" />
                  <p className="mt-3 text-sm text-gray-500">
                    {translateWithFallback(
                      t,
                      'order.pending_payment_empty',
                      'order.status.pending_payment',
                    )}
                  </p>
                </div>
              ) : (
                pendingPaymentOrders.map((order) => (
                  <PendingPaymentRow
                    key={order.orderId}
                    order={order}
                    currentState={currentState}
                    t={t}
                  />
                ))
              )}
            </div>
          )}

          {showSummary && (
            <AggregatedSummary
              orders={orders}
              produceById={produceById}
              lang={lang}
              t={t}
            />
          )}
        </>
      )}

      <EditOrderModal
        open={editOrder != null}
        order={editOrder}
        weekId={weekId}
        produceItems={produceItems}
        produceLoading={produceLoading}
        saving={editSaving}
        errorKey={editErrorKey}
        t={t}
        lang={lang}
        onClose={() => {
          setEditOrder(null)
          setEditErrorKey(null)
        }}
        onSave={handleSaveEdit}
        onLoadProduce={loadProduce}
      />

      <CancelModal
        open={cancelOrder != null}
        title={translateWithFallback(
          t,
          'order.cancel.confirm_title',
          'action.cancel',
        )}
        body={translateWithFallback(
          t,
          'order.cancel.confirm_body',
          'order.cancel.confirm_title',
        )}
        cancelLabel={t('action.cancel')}
        confirmLabel={t('action.confirm')}
        loading={cancelLoading}
        onCancel={() => setCancelOrder(null)}
        onConfirm={handleCancelConfirm}
      />

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[#E8E4DF] bg-white p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-gray-800">
            {toast.message
              ?? translateWithFallback(t, toast.key, toast.fallbackKey)}
          </p>
        </div>
      )}
    </div>
  )
}
