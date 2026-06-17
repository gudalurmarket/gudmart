import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch, apiPost } from '../../shared/lib/api.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import {
  ORDER_STATUS,
  PAYMENT_CHANNELS,
  UNIT_TYPES,
  WEEK_STATES,
} from '../../shared/lib/constants.js'
import { formatINR, formatINROptional, paiseToRupees, parseINR } from '../../shared/lib/paise.js'

const TOAST_DISMISS_MS = 6000

const TABS = [
  { id: 'balance', labelKey: 'market_day.tab.balance' },
  { id: 'inbound', labelKey: 'market_day.tab.inbound' },
  { id: 'walkin', labelKey: 'market_day.tab.walkin' },
]

const PRODUCE_UNITS = [
  UNIT_TYPES.KG,
  UNIT_TYPES.PIECE,
  UNIT_TYPES.BUNCH,
  UNIT_TYPES.GRAMS,
]

const UNIT_TRANSLATION_KEYS = {
  [UNIT_TYPES.KG]: 'unit.kg',
  [UNIT_TYPES.PIECE]: 'unit.piece',
  [UNIT_TYPES.BUNCH]: 'unit.bunch',
  [UNIT_TYPES.GRAMS]: 'unit.100g',
}

const CHANNEL_BADGE_CLASS = {
  [PAYMENT_CHANNELS.CASH]: 'bg-[--color-surface-raised] text-[--color-text-secondary]',
  [PAYMENT_CHANNELS.UPI]: 'bg-[--color-info-light] text-[--color-info]',
}

function formatTime (isoString, lang) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function formatQtyWithUnit (qty, unit, t) {
  const unitKey = UNIT_TRANSLATION_KEYS[unit]
  const unitLabel = unitKey ? t(unitKey) : unit
  return `${qty} ${unitLabel}`
}

function ChannelPills ({ channel, onChange, t, disabled }) {
  return (
    <div className="flex gap-2">
      {[PAYMENT_CHANNELS.CASH, PAYMENT_CHANNELS.UPI].map((ch) => (
        <button
          key={ch}
          type="button"
          disabled={disabled}
          onClick={() => onChange(ch)}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
            channel === ch
              ? 'bg-[--color-primary] text-[--color-text-inverse]'
              : 'border border-[--color-border] bg-[--color-surface] text-[--color-text-secondary]'
          }`}
        >
          {t(ch === PAYMENT_CHANNELS.CASH ? 'wallet.channel.cash' : 'wallet.channel.upi')}
        </button>
      ))}
    </div>
  )
}

function MarketDayStatCard ({ label, value }) {
  return (
    <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 text-left">
      <p className="text-sm text-[--color-text-secondary]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[--color-primary]">{value}</p>
    </div>
  )
}

function ProduceItemSearch ({
  produceItems,
  productQuery,
  setProductQuery,
  productId,
  setProductId,
  itemName,
  setItemName,
  allowNewItem,
  onSelectProduce,
  t,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef(null)

  const filteredItems = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    const list = produceItems ?? []
    if (!q) return list.slice(0, 20)
    return list
      .filter((item) => (item.nameEn ?? '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [produceItems, productQuery])

  const showNewItemOption =
    allowNewItem &&
    productQuery.trim().length > 0 &&
    !filteredItems.some(
      (item) => (item.nameEn ?? '').toLowerCase() === productQuery.trim().toLowerCase(),
    )

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectProduce = (item) => {
    setProductId(item.productId)
    setItemName(null)
    setProductQuery(item.nameEn ?? '')
    setDropdownOpen(false)
    onSelectProduce?.(item)
  }

  const selectNewItem = () => {
    setProductId(null)
    setItemName(productQuery.trim())
    setDropdownOpen(false)
    onSelectProduce?.(null)
  }

  const addNewLabel = t('market_day.add_new_item').replace(
    '{{name}}',
    productQuery.trim(),
  )

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm text-[--color-text-secondary]">{t('market_day.item_label')}</label>
      <input
        type="text"
        value={productQuery}
        onChange={(e) => {
          setProductQuery(e.target.value)
          setProductId(null)
          setItemName(null)
          setDropdownOpen(true)
        }}
        onFocus={() => setDropdownOpen(true)}
        className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
        autoComplete="off"
      />
      {dropdownOpen && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[--color-border] bg-[--color-surface] py-1 shadow-md">
          {filteredItems.map((item) => (
            <li key={item.produceItemId ?? item.productId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-[--color-surface-raised]"
                onClick={() => selectProduce(item)}
              >
                {item.nameEn}
              </button>
            </li>
          ))}
          {showNewItemOption && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm font-medium text-[--color-primary] hover:bg-[--color-surface-raised]"
                onClick={selectNewItem}
              >
                {addNewLabel}
              </button>
            </li>
          )}
          {filteredItems.length === 0 && !showNewItemOption && productQuery.trim() && (
            <li className="px-3 py-2 text-sm text-[--color-text-secondary]">{t('order.empty_state')}</li>
          )}
        </ul>
      )}
    </div>
  )
}

function BalancePaymentRow ({
  order,
  expanded,
  onToggle,
  weekId,
  canEdit,
  onPaymentRecorded,
  t,
}) {
  const balanceDue = order.balanceDue ?? 0
  const [amountInput, setAmountInput] = useState('')
  const [channel, setChannel] = useState(PAYMENT_CHANNELS.CASH)
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState(null)

  useEffect(() => {
    if (expanded && balanceDue > 0) {
      setAmountInput(String(paiseToRupees(balanceDue)))
      setChannel(PAYMENT_CHANNELS.CASH)
      setErrorKey(null)
    }
  }, [expanded, balanceDue])

  const amountPaise = parseINR(amountInput)
  const amountValid =
    amountPaise != null && amountPaise >= 100 && amountPaise <= balanceDue

  const handleSubmit = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!amountValid || !canEdit) return

    setSubmitting(true)
    setErrorKey(null)
    try {
      await apiPatch(`/api/v1/weeks/${weekId}/orders/${order.orderId}`, {
        balancePayment: {
          amount: amountPaise,
          channel,
        },
      })
      const remaining = Math.max(0, balanceDue - amountPaise)
      onPaymentRecorded(order.orderId, remaining)
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[--color-text-primary]">{order.customerName}</p>
          <p className="mt-0.5 text-sm text-[--color-text-secondary]">
            {t('market_day.order_value_label')}
            {': '}
            {formatINROptional(order.orderValue)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-[--color-text-secondary]">{t('market_day.balance_due_label')}</p>
          <p className="font-semibold text-[--color-warning]">{formatINR(balanceDue)}</p>
        </div>
      </button>

      {expanded && canEdit && (
        <form className="mt-4 space-y-3 border-t border-[--color-border] pt-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm text-[--color-text-secondary]">
              {t('market_day.payment_amount_label')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-[--color-text-secondary]">{t('field.channel')}</p>
            <ChannelPills channel={channel} onChange={setChannel} t={t} />
          </div>
          {errorKey && (
            <p className="text-sm text-[--color-error]" role="alert">
              {t(errorKey)}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !amountValid}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-3 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
          >
            {submitting && <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />}
            {t('market_day.record_payment_button')}
          </button>
        </form>
      )}
    </div>
  )
}

function PreorderCommitmentPanel ({ assignments, t }) {
  if (!assignments.length) return null

  return (
    <div className="rounded-xl border border-[--color-border] bg-[--color-surface-raised] p-4">
      <h3 className="text-sm font-semibold text-[--color-primary]">
        {t('label.preorder_commitment')}
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[--color-border] text-xs text-[--color-text-secondary]">
              <th className="pb-2 pr-3 font-medium">{t('market_day.item_label')}</th>
              <th className="pb-2 pr-3 font-medium">{t('label.ordered_qty')}</th>
              <th className="pb-2 pr-3 font-medium">{t('label.delivered_qty')}</th>
              <th className="pb-2 font-medium">{t('field.unit')}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((row) => (
              <tr key={row.assignmentId} className="border-b border-[--color-border] last:border-0">
                <td className="py-2 pr-3 text-[--color-text-primary]">{row.productName}</td>
                <td className="py-2 pr-3 text-[--color-text-secondary]">{row.outgoingQty ?? 0}</td>
                <td className="py-2 pr-3 text-[--color-text-secondary]">{row.deliveredQty ?? 0}</td>
                <td className="py-2 text-[--color-text-secondary]">
                  {UNIT_TRANSLATION_KEYS[row.unit] ? t(UNIT_TRANSLATION_KEYS[row.unit]) : row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LocalFarmerInboundForm ({
  weekId,
  farmerId,
  produceItems,
  canEdit,
  onRecorded,
  t,
}) {
  const [productQuery, setProductQuery] = useState('')
  const [productId, setProductId] = useState(null)
  const [itemName, setItemName] = useState(null)
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState(UNIT_TYPES.KG)
  const [priceRupees, setPriceRupees] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState(null)

  const handleSelectProduce = (item) => {
    if (item) {
      setUnit(item.unit ?? UNIT_TYPES.KG)
      setPriceRupees(String(paiseToRupees(item.pricePerUnit ?? 0)))
    }
  }

  const resetFields = () => {
    setProductQuery('')
    setProductId(null)
    setItemName(null)
    setQty('')
    setUnit(UNIT_TYPES.KG)
    setPriceRupees('')
    setErrorKey(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canEdit || !farmerId) return

    const numericQty = Number(qty)
    const pricePaise = parseINR(priceRupees)
    if (
      !Number.isFinite(numericQty) ||
      numericQty < 0 ||
      pricePaise == null ||
      pricePaise <= 0 ||
      (!productId && !itemName)
    ) {
      setErrorKey('error.validation')
      return
    }

    setSubmitting(true)
    setErrorKey(null)
    try {
      const created = await apiPost(`/api/v1/weeks/${weekId}/localfarmer-inbound`, {
        farmerId,
        productId: productId || null,
        itemName: itemName || undefined,
        inboundQty: numericQty,
        unit,
        pricePerUnit: pricePaise,
      })
      onRecorded(created)
      resetFields()
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) return null

  return (
    <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      <h3 className="text-sm font-semibold text-[--color-primary]">
        {t('market_day.inbound_form_title')}
      </h3>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit} noValidate>
        <ProduceItemSearch
          produceItems={produceItems}
          productQuery={productQuery}
          setProductQuery={setProductQuery}
          productId={productId}
          setProductId={setProductId}
          itemName={itemName}
          setItemName={setItemName}
          allowNewItem
          onSelectProduce={handleSelectProduce}
          t={t}
        />
        <div>
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
            {t('market_day.inbound_qty_label')}
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
            {t('field.unit')}
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
          >
            {PRODUCE_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(UNIT_TRANSLATION_KEYS[u])}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
            {t('market_day.inbound_price_label')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
          />
        </div>
        {errorKey && (
          <p className="text-sm text-[--color-error]" role="alert">
            {t(errorKey)}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-3 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
        >
          {submitting && <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />}
          {t('market_day.inbound_submit_button')}
        </button>
      </form>
    </div>
  )
}

function InboundRecordRow ({ record, productNameById, t, lang }) {
  const displayName =
    record.itemName ??
    productNameById.get(record.productId) ??
    record.productId ??
    '—'

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <p className="font-medium text-[--color-text-primary]">{displayName}</p>
      <p className="mt-1 text-sm text-[--color-text-secondary]">
        {formatQtyWithUnit(record.inboundQty, record.unit, t)}
        {' · '}
        {formatINR(record.pricePerUnit)}
        {' / '}
        {t(UNIT_TRANSLATION_KEYS[record.unit] ?? 'unit.kg')}
      </p>
      <p className="mt-1 text-xs text-[--color-text-disabled]">
        {formatTime(record.createdAt, lang)}
      </p>
    </div>
  )
}

function WalkInSaleForm ({
  weekId,
  produceItems,
  localFarmers,
  canEdit,
  onRecorded,
  t,
}) {
  const [productQuery, setProductQuery] = useState('')
  const [productId, setProductId] = useState(null)
  const [, setItemName] = useState(null)
  const [selectedUnit, setSelectedUnit] = useState(UNIT_TYPES.KG)
  const [inventorySource, setInventorySource] = useState('outstation')
  const [farmerId, setFarmerId] = useState('')
  const [qty, setQty] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [channel, setChannel] = useState(PAYMENT_CHANNELS.CASH)
  const [showCustomer, setShowCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState(null)

  const resetForm = () => {
    setProductQuery('')
    setProductId(null)
    setItemName(null)
    setSelectedUnit(UNIT_TYPES.KG)
    setInventorySource('outstation')
    setFarmerId('')
    setQty('')
    setAmountInput('')
    setChannel(PAYMENT_CHANNELS.CASH)
    setShowCustomer(false)
    setCustomerName('')
    setCustomerPhone('')
    setErrorKey(null)
  }

  const handleSelectProduce = (item) => {
    if (item) {
      setSelectedUnit(item.unit ?? UNIT_TYPES.KG)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canEdit) return

    const numericQty = Number(qty)
    const amountPaise = parseINR(amountInput)
    if (
      !productId ||
      !Number.isFinite(numericQty) ||
      numericQty < 0 ||
      amountPaise == null ||
      amountPaise <= 0
    ) {
      setErrorKey('error.validation')
      return
    }
    if (inventorySource === 'local_farmer' && !farmerId) {
      setErrorKey('error.validation')
      return
    }

    const pricePerUnit =
      numericQty > 0 ? Math.max(1, Math.round(amountPaise / numericQty)) : amountPaise

    setSubmitting(true)
    setErrorKey(null)
    try {
      const body = {
        productId,
        inventorySource,
        qty: numericQty,
        unit: selectedUnit,
        pricePerUnit,
        channel,
      }
      if (inventorySource === 'local_farmer') {
        body.farmerId = farmerId
      }
      if (showCustomer && customerPhone.trim()) {
        body.customerPhone = customerPhone.trim()
      }

      const created = await apiPost(`/api/v1/weeks/${weekId}/walkin`, body)
      onRecorded({
        ...created,
        looseCustomerName: showCustomer && customerName.trim() ? customerName.trim() : null,
      })
      resetForm()
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (!canEdit) return null

  return (
    <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      <h3 className="text-sm font-semibold text-[--color-primary]">
        {t('market_day.walkin_form_title')}
      </h3>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit} noValidate>
        <ProduceItemSearch
          produceItems={produceItems}
          productQuery={productQuery}
          setProductQuery={setProductQuery}
          productId={productId}
          setProductId={setProductId}
          itemName={null}
          setItemName={setItemName}
          allowNewItem={false}
          onSelectProduce={handleSelectProduce}
          t={t}
        />

        <div>
          <p className="mb-2 text-sm text-[--color-text-secondary]">{t('market_day.inventory_source_label')}</p>
          <div className="flex gap-2">
            {['outstation', 'local_farmer'].map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setInventorySource(src)}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${
                  inventorySource === src
                    ? 'bg-[--color-primary] text-[--color-text-inverse]'
                    : 'border border-[--color-border] bg-[--color-surface] text-[--color-text-secondary]'
                }`}
              >
                {t(
                  src === 'outstation'
                    ? 'market_day.source.outstation'
                    : 'market_day.source.local_farmer',
                )}
              </button>
            ))}
          </div>
        </div>

        {inventorySource === 'local_farmer' && (
          <div>
            <label className="mb-1 block text-sm text-[--color-text-secondary]">
              {t('market_day.walkin_farmer_label')}
            </label>
            <select
              value={farmerId}
              onChange={(e) => setFarmerId(e.target.value)}
              className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
              required
            >
              <option value="">—</option>
              {localFarmers.map((f) => (
                <option key={f.farmerId} value={f.farmerId}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
            {t('market_day.walkin_qty_label')}
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
            {t('market_day.walkin_amount_label')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <p className="mb-2 text-sm text-[--color-text-secondary]">{t('field.channel')}</p>
          <ChannelPills channel={channel} onChange={setChannel} t={t} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-[--color-text-secondary]">
          <input
            type="checkbox"
            checked={showCustomer}
            onChange={(e) => setShowCustomer(e.target.checked)}
            className="h-4 w-4 rounded border-[--color-border]"
          />
          {t('market_day.record_customer_details')}
        </label>

        {showCustomer && (
          <>
            <div>
              <label className="mb-1 block text-sm text-[--color-text-secondary]">
                {t('market_day.walkin_customer_name_label')}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[--color-text-secondary]">
                {t('market_day.walkin_customer_phone_label')}
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {errorKey && (
          <p className="text-sm text-[--color-error]" role="alert">
            {t(errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-3 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
        >
          {submitting && <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />}
          {t('market_day.walkin_submit_button')}
        </button>
      </form>
    </div>
  )
}

function WalkInSaleRow ({ sale, productMetaById, t, lang }) {
  const meta = productMetaById.get(sale.productId) ?? {}
  const productName = meta.nameEn ?? sale.productId ?? '—'
  const unit = meta.unit ?? UNIT_TYPES.KG
  const sourceKey =
    sale.inventorySource === 'local_farmer'
      ? 'market_day.source.local_farmer'
      : 'market_day.source.outstation'
  const sourceClass =
    sale.inventorySource === 'local_farmer'
      ? 'bg-[--color-success-light] text-[--color-success]'
      : 'bg-[--color-info-light] text-[--color-info]'
  const channelKey =
    sale.channel === PAYMENT_CHANNELS.UPI ? 'wallet.channel.upi' : 'wallet.channel.cash'

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[--color-text-primary]">{productName}</p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sourceClass}`}
          >
            {t(sourceKey)}
          </span>
          <p className="mt-1 text-sm text-[--color-text-secondary]">
            {formatQtyWithUnit(sale.qtySold, unit, t)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-[--color-primary]">
            {formatINROptional(sale.amountCollected)}
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_BADGE_CLASS[sale.channel] ?? 'bg-[--color-surface-raised] text-[--color-text-secondary]'}`}
          >
            {t(channelKey)}
          </span>
          <p className="mt-1 text-xs text-[--color-text-disabled]">{formatTime(sale.createdAt, lang)}</p>
        </div>
      </div>
    </div>
  )
}

export default function MarketDay () {
  const { t, lang } = useLang()

  const [loading, setLoading] = useState(true)
  const [loadErrorKey, setLoadErrorKey] = useState(null)
  const [weekId, setWeekId] = useState(null)
  const [currentState, setCurrentState] = useState(null)
  const [marketDate, setMarketDate] = useState(null)

  const [activeTab, setActiveTab] = useState('balance')
  const [orders, setOrders] = useState([])
  const [localFarmers, setLocalFarmers] = useState([])
  const [produceItems, setProduceItems] = useState([])
  const [walkInSales, setWalkInSales] = useState([])
  const [inboundRecords, setInboundRecords] = useState([])
  const [deliveryAssignments, setDeliveryAssignments] = useState([])

  const [selectedFarmerId, setSelectedFarmerId] = useState(null)
  const [expandedOrderId, setExpandedOrderId] = useState(null)
  const [toast, setToast] = useState(null)

  const isMarketDay = currentState === WEEK_STATES.MARKET_DAY
  const canEdit = isMarketDay

  const productNameById = useMemo(
    () => new Map(produceItems.map((p) => [p.productId, p.nameEn])),
    [produceItems],
  )

  const productMetaById = useMemo(
    () =>
      new Map(
        produceItems.map((p) => [
          p.productId,
          { nameEn: p.nameEn, unit: p.unit },
        ]),
      ),
    [produceItems],
  )

  const ordersWithBalance = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          (o.status === ORDER_STATUS.DISPATCHED || o.status === 'dispatched') &&
          (o.balanceDue ?? 0) > 0,
      ),
    [orders],
  )

  const inboundForFarmer = useMemo(
    () => inboundRecords.filter((r) => r.farmerId === selectedFarmerId),
    [inboundRecords, selectedFarmerId],
  )

  const preorderForFarmer = useMemo(
    () => deliveryAssignments.filter((a) => a.farmerId === selectedFarmerId),
    [deliveryAssignments, selectedFarmerId],
  )

  const walkInTotals = useMemo(() => {
    let cash = 0
    let upi = 0
    for (const sale of walkInSales) {
      const amt = sale.amountCollected ?? 0
      if (sale.channel === PAYMENT_CHANNELS.UPI) upi += amt
      else cash += amt
    }
    return { cash, upi }
  }, [walkInSales])

  const loadPage = useCallback(async () => {
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
        setLocalFarmers([])
        setProduceItems([])
        setWalkInSales([])
        return
      }

      const id = resolveWeekId(active)
      setWeekId(id)
      setCurrentState(active.state)
      setMarketDate(active.marketDate ?? active.market_date)

      const [ordersData, farmersData, produceData, walkinData, deliveryData] = await Promise.all([
        apiGet(`/api/v1/weeks/${id}/orders?status=dispatched`),
        apiGet('/api/v1/farmers?type=local&status=active'),
        apiGet(`/api/v1/weeks/${id}/produce`),
        apiGet(`/api/v1/weeks/${id}/walkin`),
        apiGet(`/api/v1/weeks/${id}/delivery`),
      ])

      const farmers = farmersData.farmers ?? []
      setOrders(ordersData.orders ?? [])
      setLocalFarmers(farmers)
      setProduceItems(produceData.items ?? [])
      setWalkInSales(walkinData.sales ?? [])
      setDeliveryAssignments(deliveryData.assignments ?? [])

      if (farmers.length > 0) {
        setSelectedFarmerId((prev) => prev ?? farmers[0].farmerId)
      } else {
        setSelectedFarmerId(null)
      }
    } catch (err) {
      setLoadErrorKey(apiErrorTranslationKey(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const handlePaymentRecorded = (orderId, remainingBalanceDue) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === orderId ? { ...o, balanceDue: remainingBalanceDue } : o,
      ),
    )
    setExpandedOrderId(null)
    setToast({ key: 'toast.balance_payment_recorded' })
  }

  const handleInboundRecorded = (record) => {
    setInboundRecords((prev) => [...prev, record])
    setToast({ key: 'toast.inbound_recorded' })
  }

  const handleWalkInRecorded = (sale) => {
    setWalkInSales((prev) => [sale, ...prev])
    setToast({ key: 'toast.walkin_recorded' })
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner />
      </div>
    )
  }

  if (loadErrorKey) {
    return (
      <div className="bg-[--color-background] p-4">
        <div className="rounded-xl border border-[--color-error-light] bg-[--color-surface] p-6 text-center">
          <p className="text-sm text-[--color-error]">{t(loadErrorKey)}</p>
          <button
            type="button"
            onClick={loadPage}
            className="mt-4 rounded-xl bg-[--color-primary] px-4 py-2 text-sm text-[--color-text-inverse]"
          >
            {t('action.reload')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[--color-background] pb-24">
      <header className="border-b border-[--color-border] bg-[--color-surface] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <StateMachineBadge state={currentState} />
          {marketDate && (
            <p className="text-sm text-[--color-text-secondary]">{formatMarketDate(marketDate, lang)}</p>
          )}
        </div>
        {!isMarketDay && currentState != null && (
          <p className="mt-2 text-sm text-[--color-warning]">{t('market_day.read_only_notice')}</p>
        )}
      </header>

      <div className="mt-3 flex gap-1 border-b border-[--color-border] bg-[--color-surface] px-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 border-b-2 px-2 py-3 text-center text-xs font-medium sm:text-sm ${
              activeTab === tab.id
                ? 'border-[--color-primary] text-[--color-primary]'
                : 'border-transparent text-[--color-text-secondary]'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'balance' && (
          <section>
            {ordersWithBalance.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <CheckCircle size={32} strokeWidth={1.5} className="text-[--color-success]" />
                <p className="mt-3 text-sm text-[--color-text-secondary]">{t('market_day.no_balance_due')}</p>
              </div>
            ) : (
              ordersWithBalance.map((order) => (
                <BalancePaymentRow
                  key={order.orderId}
                  order={order}
                  expanded={expandedOrderId === order.orderId}
                  onToggle={() =>
                    setExpandedOrderId((prev) =>
                      prev === order.orderId ? null : order.orderId,
                    )
                  }
                  weekId={weekId}
                  canEdit={canEdit}
                  onPaymentRecorded={handlePaymentRecorded}
                  t={t}
                />
              ))
            )}
          </section>
        )}

        {activeTab === 'inbound' && (
          <section className="space-y-4">
            {localFarmers.length === 0 ? (
              <p className="text-sm text-[--color-text-secondary]">{t('market_day.no_local_farmers')}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {localFarmers.map((farmer) => (
                    <button
                      key={farmer.farmerId}
                      type="button"
                      onClick={() => setSelectedFarmerId(farmer.farmerId)}
                      className={`rounded-full px-4 py-2 text-sm font-medium ${
                        selectedFarmerId === farmer.farmerId
                          ? 'bg-[--color-primary] text-[--color-text-inverse]'
                          : 'border border-[--color-border] bg-[--color-surface] text-[--color-text-secondary]'
                      }`}
                    >
                      {farmer.name}
                    </button>
                  ))}
                </div>

                {selectedFarmerId && (
                  <>
                    <PreorderCommitmentPanel assignments={preorderForFarmer} t={t} />
                    <LocalFarmerInboundForm
                      weekId={weekId}
                      farmerId={selectedFarmerId}
                      produceItems={produceItems}
                      canEdit={canEdit}
                      onRecorded={handleInboundRecorded}
                      t={t}
                    />
                  </>
                )}

                {inboundForFarmer.length === 0 ? (
                  <p className="text-sm text-[--color-text-secondary]">{t('market_day.no_inbound_records')}</p>
                ) : (
                  inboundForFarmer.map((record) => (
                    <InboundRecordRow
                      key={record.inboundId}
                      record={record}
                      productNameById={productNameById}
                      t={t}
                      lang={lang}
                    />
                  ))
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'walkin' && (
          <section className="space-y-4">
            <WalkInSaleForm
              weekId={weekId}
              produceItems={produceItems}
              localFarmers={localFarmers}
              canEdit={canEdit}
              onRecorded={handleWalkInRecorded}
              t={t}
            />

            {walkInSales.length === 0 ? (
              <p className="text-sm text-[--color-text-secondary]">{t('market_day.no_walkin_sales')}</p>
            ) : (
              <>
                {walkInSales.map((sale) => (
                  <WalkInSaleRow
                    key={sale.saleId}
                    sale={sale}
                    productMetaById={productMetaById}
                    t={t}
                    lang={lang}
                  />
                ))}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MarketDayStatCard
                    label={t('market_day.total_cash')}
                    value={formatINR(walkInTotals.cash)}
                  />
                  <MarketDayStatCard
                    label={t('market_day.total_upi')}
                    value={formatINR(walkInTotals.upi)}
                  />
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-xl bg-[--color-primary] px-4 py-3 text-center text-sm text-[--color-text-inverse] shadow-lg"
          role="status"
        >
          {t(toast.key)}
        </div>
      )}
    </div>
  )
}
