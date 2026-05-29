import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy,
  Loader2,
  PackageOpen,
  Pencil,
  Trash2,
} from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { ApiError, apiGet, apiPatch, apiPost } from '../../shared/lib/api.js'
import { resolveWeekId } from '../../shared/lib/apiErrors.js'
import { pickActiveWeek, formatMarketDate } from '../../shared/lib/activeWeek.js'
import { UNIT_TYPES, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR, paiseToRupees, parseINR } from '../../shared/lib/paise.js'

const TOAST_DISMISS_MS = 6000
const COPY_LABEL_RESET_MS = 1500

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

/**
 * @param {object} item
 * @param {'en' | 'ta'} lang
 */
function itemDisplayName (item, lang) {
  if (lang === 'ta' && item.nameTa) {
    return item.nameTa
  }
  return item.nameEn ?? ''
}

/**
 * @param {Array<object>} items
 * @param {'en' | 'ta'} tabLang
 */
function buildCopyableText (items, tabLang) {
  return items
    .map((item) => {
      const name =
        tabLang === 'ta' && item.nameTa ? item.nameTa : item.nameEn ?? ''
      return `${name} — ${item.unit} — ${formatINR(item.pricePerUnit)}`
    })
    .join('\n')
}

function formatItemCount (count, t) {
  const template = t('week_setup.item_count')
  if (template !== 'week_setup.item_count') {
    return template.replace('{{count}}', String(count))
  }
  return `${count} items`
}

function CreateWeekForm ({ onCreated, t }) {
  const [marketDate, setMarketDate] = useState('')
  const [openingCash, setOpeningCash] = useState('')
  const [openingBank, setOpeningBank] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState(null)

  const minDate = todayDateInputValue()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorKey(null)

    if (!marketDate || !isDateOnOrAfterToday(marketDate)) {
      setErrorKey('error.validation')
      return
    }

    const cashPaise = parseINR(openingCash)
    const bankPaise = parseINR(openingBank)
    if (cashPaise == null || bankPaise == null) {
      setErrorKey('error.validation')
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
        setErrorKey('error.duplicate_market_date')
      } else {
        setErrorKey('error.unknown')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label
            htmlFor="week-market-date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('week_setup.market_date.label')}
          </label>
          <input
            id="week-market-date"
            type="date"
            required
            min={minDate}
            value={marketDate}
            onChange={(e) => setMarketDate(e.target.value)}
            className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="week-opening-cash"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('week_setup.opening_cash.label')}
          </label>
          <input
            id="week-opening-cash"
            type="text"
            inputMode="decimal"
            required
            min={0}
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('week_setup.opening_balance.helper')}
          </p>
        </div>

        <div>
          <label
            htmlFor="week-opening-bank"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('week_setup.opening_bank.label')}
          </label>
          <input
            id="week-opening-bank"
            type="text"
            inputMode="decimal"
            required
            min={0}
            value={openingBank}
            onChange={(e) => setOpeningBank(e.target.value)}
            className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('week_setup.opening_balance.helper')}
          </p>
        </div>

        {errorKey && (
          <p className="text-sm text-red-600" role="alert">
            {t(errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D5A1B] py-4 text-white disabled:opacity-60"
        >
          {submitting && (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden />
          )}
          {t('week_setup.create_week.button')}
        </button>
      </form>
    </div>
  )
}

function ProduceItemRow ({
  item,
  currentState,
  lang,
  t,
  weekId,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onUpdated,
  onDeleted,
  onToast,
}) {
  const [unit, setUnit] = useState(item.unit)
  const [priceRupees, setPriceRupees] = useState(String(paiseToRupees(item.pricePerUnit)))
  const [saving, setSaving] = useState(false)
  const [rowErrorKey, setRowErrorKey] = useState(null)

  useEffect(() => {
    if (isEditing) {
      setUnit(item.unit)
      setPriceRupees(String(paiseToRupees(item.pricePerUnit)))
      setRowErrorKey(null)
    }
  }, [isEditing, item])

  const canEdit =
    currentState === WEEK_STATES.SETUP || currentState === WEEK_STATES.OPEN
  const canDelete = currentState === WEEK_STATES.SETUP
  const unitEditable = currentState === WEEK_STATES.SETUP

  const handleSave = async () => {
    const pricePaise = parseINR(priceRupees)
    if (pricePaise == null || pricePaise <= 0) {
      setRowErrorKey('error.validation')
      return
    }

    const body = { pricePerUnit: pricePaise }
    if (currentState === WEEK_STATES.SETUP) {
      body.unit = unit
    }

    setSaving(true)
    setRowErrorKey(null)
    try {
      const result = await apiPatch(
        `/api/v1/weeks/${weekId}/produce/${item.produceItemId}`,
        body,
      )

      const updated = {
        ...item,
        pricePerUnit: result.pricePerUnit ?? body.pricePerUnit,
        unit: unitEditable ? unit : item.unit,
      }

      onUpdated(updated)

      if (currentState === WEEK_STATES.OPEN) {
        onToast('toast.price_change_may_affect_orders')
      }
    } catch {
      setRowErrorKey('error.unknown')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await apiPatch(
        `/api/v1/weeks/${weekId}/produce/${item.produceItemId}`,
        { active: false },
      )
      onDeleted(item.produceItemId)
    } catch {
      onToast('error.unknown')
    }
  }

  if (isEditing) {
    return (
      <li className="rounded-xl border border-[#E8E4DF] bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-xs text-gray-500">
              {t('week_setup.unit.label')}
            </label>
            <select
              value={unit}
              disabled={!unitEditable}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-600"
            >
              {PRODUCE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(UNIT_TRANSLATION_KEYS[u])}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-xs text-gray-500">
              {t('week_setup.price.label')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              className="w-full rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#2D5A1B] px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {t('action.save')}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={saving}
              className="rounded-lg border border-[#E8E4DF] px-3 py-1.5 text-sm text-gray-600"
            >
              {t('action.cancel')}
            </button>
          </div>
        </div>
        {rowErrorKey && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {t(rowErrorKey)}
          </p>
        )}
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between rounded-xl border border-[#E8E4DF] bg-white px-4 py-3">
      <div className="min-w-0 flex-1 pr-3">
        <p className="font-medium text-gray-900">{itemDisplayName(item, lang)}</p>
        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {t(UNIT_TRANSLATION_KEYS[item.unit] ?? 'unit.kg')}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-base font-semibold text-[#2D5A1B]">
          {formatINR(item.pricePerUnit)}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded p-1 text-gray-500 hover:bg-gray-50"
            aria-label={t('action.edit')}
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded p-1 text-red-400 hover:bg-red-50"
            aria-label={t('action.delete')}
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </li>
  )
}

function AddItemForm ({
  weekId,
  items,
  currentState,
  t,
  onAdded,
}) {
  const [catalogue, setCatalogue] = useState(null)
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [productId, setProductId] = useState(null)
  const [newProductName, setNewProductName] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [unit, setUnit] = useState(UNIT_TYPES.KG)
  const [priceRupees, setPriceRupees] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  const containerRef = useRef(null)

  const canShowForm =
    currentState === WEEK_STATES.SETUP || currentState === WEEK_STATES.OPEN

  const loadCatalogue = useCallback(async () => {
    if (catalogue != null || catalogueLoading) return
    setCatalogueLoading(true)
    try {
      const data = await apiGet('/api/v1/catalogue')
      setCatalogue((data.products ?? []).filter((p) => p.active !== false))
    } catch {
      setCatalogue([])
    } finally {
      setCatalogueLoading(false)
    }
  }, [catalogue, catalogueLoading])

  const filteredProducts = useMemo(() => {
    const list = catalogue ?? []
    const q = productQuery.trim().toLowerCase()
    if (!q) return list.slice(0, 20)
    return list
      .filter((p) => (p.nameEn ?? '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [catalogue, productQuery])

  const duplicateOnList = useMemo(() => {
    if (!productId) return false
    return items.some((item) => item.productId === productId)
  }, [items, productId])

  const showNewProductOption =
    productQuery.trim().length > 0 &&
    !filteredProducts.some(
      (p) => (p.nameEn ?? '').toLowerCase() === productQuery.trim().toLowerCase(),
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

  const resetForm = () => {
    setProductQuery('')
    setProductId(null)
    setNewProductName(null)
    setUnit(UNIT_TYPES.KG)
    setPriceRupees('')
    setErrorKey(null)
    setDropdownOpen(false)
  }

  const selectCatalogueProduct = (product) => {
    setProductId(product.productId)
    setNewProductName(null)
    setProductQuery(product.nameEn ?? '')
    setUnit(product.defaultUnit ?? UNIT_TYPES.KG)
    setDropdownOpen(false)
  }

  const selectNewProduct = () => {
    setProductId(null)
    setNewProductName(productQuery.trim())
    setDropdownOpen(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorKey(null)

    if (duplicateOnList) return

    const pricePaise = parseINR(priceRupees)
    if (pricePaise == null || pricePaise <= 0) {
      setErrorKey('error.validation')
      return
    }

    let resolvedProductId = productId
    if (!resolvedProductId && !newProductName) {
      setErrorKey('error.validation')
      return
    }

    setSubmitting(true)
    try {
      if (!resolvedProductId && newProductName) {
        const created = await apiPost('/api/v1/catalogue', {
          nameEn: newProductName,
          defaultUnit: unit,
        })
        resolvedProductId = created.productId
      }

      const createdItem = await apiPost(`/api/v1/weeks/${weekId}/produce`, {
        productId: resolvedProductId,
        unit,
        pricePerUnit: pricePaise,
        displayOrder: items.length,
      })

      onAdded(createdItem)
      resetForm()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_PRODUCE_ITEM') {
        setErrorKey('week_setup.duplicate_item_warning')
      } else {
        setErrorKey('error.unknown')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!canShowForm) {
    return null
  }

  const addNewLabel = t('week_setup.add_new_product').replace(
    '{{name}}',
    productQuery.trim(),
  )

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[#E8E4DF] bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-gray-700">
        {t('week_setup.add_item.title')}
      </h3>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit} noValidate>
        <div className="relative">
          <label className="mb-1 block text-sm text-gray-600">
            {t('week_setup.product.label')}
          </label>
          <input
            type="text"
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value)
              setProductId(null)
              setNewProductName(null)
              setDropdownOpen(true)
            }}
            onFocus={() => {
              loadCatalogue()
              setDropdownOpen(true)
            }}
            className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm"
            autoComplete="off"
          />
          {dropdownOpen && (catalogue != null || catalogueLoading) && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#E8E4DF] bg-white py-1 shadow-md">
              {catalogueLoading && (
                <li className="px-3 py-2 text-sm text-gray-500">{t('action.loading')}</li>
              )}
              {!catalogueLoading &&
                filteredProducts.map((product) => (
                  <li key={product.productId}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      onClick={() => selectCatalogueProduct(product)}
                    >
                      {product.nameEn}
                    </button>
                  </li>
                ))}
              {!catalogueLoading && showNewProductOption && (
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm font-medium text-[#2D5A1B] hover:bg-gray-50"
                    onClick={selectNewProduct}
                  >
                    {addNewLabel}
                  </button>
                </li>
              )}
            </ul>
          )}
          {duplicateOnList && (
            <p className="mt-1 text-sm text-amber-700" role="alert">
              {t('week_setup.duplicate_item_warning')}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">
            {t('week_setup.unit.label')}
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm"
          >
            {PRODUCE_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(UNIT_TRANSLATION_KEYS[u])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">
            {t('week_setup.price.label')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            placeholder={t('week_setup.price.placeholder')}
            className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm"
          />
        </div>

        {errorKey && (
          <p className="text-sm text-red-600" role="alert">
            {t(errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || duplicateOnList}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D5A1B] py-3 text-sm text-white disabled:opacity-60"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden />
          )}
          {t('week_setup.add_item.button')}
        </button>
      </form>
    </div>
  )
}

function CopyableList ({ items, t }) {
  const [tab, setTab] = useState('en')
  const [copied, setCopied] = useState(false)

  const formattedText = useMemo(
    () => buildCopyableText(items, tab),
    [items, tab],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedText)
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_LABEL_RESET_MS)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#E8E4DF] bg-white p-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('en')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            tab === 'en'
              ? 'bg-[#2D5A1B] text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('lang.english')}
        </button>
        <button
          type="button"
          onClick={() => setTab('ta')}
          className={`rounded-full px-3 py-1 text-xs font-medium font-tamil ${
            tab === 'ta'
              ? 'bg-[#2D5A1B] text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('lang.tamil')}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-[#F0EDE8] p-3 text-sm text-gray-800 font-sans">
        {formattedText}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!formattedText}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#2D5A1B] disabled:opacity-50"
      >
        <Copy size={16} strokeWidth={1.5} />
        {copied ? t('action.copied') : t('action.copy')}
      </button>
    </div>
  )
}

function ProduceListMode ({
  week,
  items,
  setItems,
  t,
  lang,
  onToast,
}) {
  const [editingItemId, setEditingItemId] = useState(null)
  const weekId = resolveWeekId(week)
  const currentState = week.state

  const handleItemUpdated = (updated) => {
    setItems((prev) =>
      prev.map((row) =>
        row.produceItemId === updated.produceItemId ? { ...row, ...updated } : row,
      ),
    )
    setEditingItemId(null)
  }

  const handleItemDeleted = (produceItemId) => {
    setItems((prev) => prev.filter((row) => row.produceItemId !== produceItemId))
    if (editingItemId === produceItemId) {
      setEditingItemId(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <StateMachineBadge state={currentState} />
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">
            {formatMarketDate(week.marketDate, lang)}
          </p>
          <p className="text-sm text-gray-500">
            {formatItemCount(items.length, t)}
          </p>
        </div>
      </header>

      <section className="space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E8E4DF] bg-white py-12 text-center">
            <PackageOpen className="text-gray-300" size={32} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-gray-600">
              {t('week_setup.empty_produce_list')}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t('week_setup.add_first_item_hint')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ProduceItemRow
                key={item.produceItemId}
                item={item}
                currentState={currentState}
                lang={lang}
                t={t}
                weekId={weekId}
                isEditing={editingItemId === item.produceItemId}
                onStartEdit={() => setEditingItemId(item.produceItemId)}
                onCancelEdit={() => setEditingItemId(null)}
                onUpdated={handleItemUpdated}
                onDeleted={handleItemDeleted}
                onToast={onToast}
              />
            ))}
          </ul>
        )}
      </section>

      <AddItemForm
        weekId={weekId}
        items={items}
        currentState={currentState}
        t={t}
        onAdded={(newItem) => setItems((prev) => [...prev, newItem])}
      />

      <CopyableList items={items} t={t} />
    </div>
  )
}

export default function WeekSetup () {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [activeWeek, setActiveWeek] = useState(null)
  const [produceItems, setProduceItems] = useState([])
  const [toastKey, setToastKey] = useState(null)

  const loadWeek = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet('/api/v1/weeks')
      const week = pickActiveWeek(data.weeks ?? [])
      setActiveWeek(week)

      if (week) {
        const weekId = resolveWeekId(week)
        const produceData = await apiGet(`/api/v1/weeks/${weekId}/produce`)
        setProduceItems(produceData.items ?? [])
      } else {
        setProduceItems([])
      }
    } catch {
      setActiveWeek(null)
      setProduceItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  useEffect(() => {
    if (!toastKey) return undefined
    const timer = setTimeout(() => setToastKey(null), TOAST_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toastKey])

  const handleWeekCreated = () => {
    navigate('/operator/setup', { replace: true })
    loadWeek()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#F0EDE8]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[#F0EDE8]">
      {!activeWeek ? (
        <div className="px-4 py-8">
          <CreateWeekForm onCreated={handleWeekCreated} t={t} />
        </div>
      ) : (
        <ProduceListMode
          week={activeWeek}
          items={produceItems}
          setItems={setProduceItems}
          t={t}
          lang={lang}
          onToast={setToastKey}
        />
      )}

      {toastKey && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-[#E8E4DF] bg-white p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm text-gray-800">{t(toastKey)}</p>
        </div>
      )}
    </div>
  )
}
