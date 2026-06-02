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
import { apiGet, apiPatch, apiPost } from '../../shared/lib/api.js'
import CreateWeekForm from '../components/CreateWeekForm.jsx'
import { notifyActiveWeekChanged } from '../../shared/hooks/useWeekState.js'
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
      <li className="rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-xs text-[--color-text-secondary]">
              {t('week_setup.unit.label')}
            </label>
            <select
              value={unit}
              disabled={!unitEditable}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-lg border border-[--color-border] px-2 py-1.5 text-sm disabled:bg-[--color-surface-raised] disabled:text-[--color-text-secondary]"
            >
              {PRODUCE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(UNIT_TRANSLATION_KEYS[u])}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-xs text-[--color-text-secondary]">
              {t('week_setup.price.label')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              className="w-full rounded-lg border border-[--color-border] px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[--color-primary] px-3 py-1.5 text-sm text-[--color-text-inverse] disabled:opacity-60"
            >
              {t('action.save')}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={saving}
              className="rounded-lg border border-[--color-border] px-3 py-1.5 text-sm text-[--color-text-secondary]"
            >
              {t('action.cancel')}
            </button>
          </div>
        </div>
        {rowErrorKey && (
          <p className="mt-2 text-sm text-[--color-error]" role="alert">
            {t(rowErrorKey)}
          </p>
        )}
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="min-w-0 flex-1 pr-3">
        <p className="font-medium text-[--color-text-primary]">{itemDisplayName(item, lang)}</p>
        <span className="mt-1 inline-block rounded-full bg-[--color-surface-raised] px-2 py-0.5 text-xs text-[--color-text-secondary]">
          {t(UNIT_TRANSLATION_KEYS[item.unit] ?? 'unit.kg')}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-base font-semibold text-[--color-primary]">
          {formatINR(item.pricePerUnit)}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded p-1 text-[--color-text-secondary] hover:bg-[--color-surface-raised]"
            aria-label={t('action.edit')}
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded p-1 text-[--color-error] hover:bg-[--color-error-light]"
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
      className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4"
    >
      <h3 className="text-sm font-semibold text-[--color-text-secondary]">
        {t('week_setup.add_item.title')}
      </h3>
      <form className="mt-3 space-y-3" onSubmit={handleSubmit} noValidate>
        <div className="relative">
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
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
            className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
            autoComplete="off"
          />
          {dropdownOpen && (catalogue != null || catalogueLoading) && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[--color-border] bg-[--color-surface] py-1 shadow-md">
              {catalogueLoading && (
                <li className="px-3 py-2 text-sm text-[--color-text-secondary]">{t('action.loading')}</li>
              )}
              {!catalogueLoading &&
                filteredProducts.map((product) => (
                  <li key={product.productId}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[--color-surface-raised]"
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
                    className="w-full px-3 py-2 text-left text-sm font-medium text-[--color-primary] hover:bg-[--color-surface-raised]"
                    onClick={selectNewProduct}
                  >
                    {addNewLabel}
                  </button>
                </li>
              )}
            </ul>
          )}
          {duplicateOnList && (
            <p className="mt-1 text-sm text-[--color-warning]" role="alert">
              {t('week_setup.duplicate_item_warning')}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm text-[--color-text-secondary]">
            {t('week_setup.unit.label')}
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
            {t('week_setup.price.label')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            placeholder={t('week_setup.price.placeholder')}
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
          disabled={submitting || duplicateOnList}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--color-primary] py-3 text-sm text-[--color-text-inverse] disabled:opacity-60"
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
    <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('en')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            tab === 'en'
              ? 'bg-[--color-primary] text-[--color-text-inverse]'
              : 'bg-[--color-surface-raised] text-[--color-text-secondary]'
          }`}
        >
          {t('lang.english')}
        </button>
        <button
          type="button"
          onClick={() => setTab('ta')}
          className={`rounded-full px-3 py-1 text-xs font-medium font-tamil ${
            tab === 'ta'
              ? 'bg-[--color-primary] text-[--color-text-inverse]'
              : 'bg-[--color-surface-raised] text-[--color-text-secondary]'
          }`}
        >
          {t('lang.tamil')}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-[--color-background] p-3 text-sm text-[--color-text-primary] font-sans">
        {formattedText}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!formattedText}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[--color-primary] disabled:opacity-50"
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
          <p className="text-sm font-medium text-[--color-text-primary]">
            {formatMarketDate(week.marketDate, lang)}
          </p>
          <p className="text-sm text-[--color-text-secondary]">
            {formatItemCount(items.length, t)}
          </p>
        </div>
      </header>

      <section className="space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[--color-border] bg-[--color-surface] py-12 text-center">
            <PackageOpen className="text-[--color-text-disabled]" size={32} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-[--color-text-secondary]">
              {t('week_setup.empty_produce_list')}
            </p>
            <p className="mt-1 text-xs text-[--color-text-secondary]">
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
    notifyActiveWeekChanged()
    setToastKey('toast.week_created')
    navigate('/operator/dashboard', { replace: true })
    loadWeek()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[--color-background]">
      {!activeWeek ? (
        <div className="px-4 py-8">
          <div className="mx-auto max-w-md rounded-2xl bg-[--color-surface] p-6">
            <CreateWeekForm onCreated={handleWeekCreated} t={t} />
          </div>
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
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-[--color-border] bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm text-[--color-text-primary]">{t(toastKey)}</p>
        </div>
      )}
    </div>
  )
}
