import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Plus, X } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch, apiPost } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { UNIT_TYPES } from '../../shared/lib/constants.js'
import useWeekState from '../../shared/hooks/useWeekState.js'

const TOAST_DISMISS_MS = 4000

const ALL_UNITS = [UNIT_TYPES.KG, UNIT_TYPES.PIECE, UNIT_TYPES.BUNCH, UNIT_TYPES.GRAMS]

const UNIT_BADGE_CLASS = {
  [UNIT_TYPES.KG]: 'bg-amber-100 text-amber-700',
  [UNIT_TYPES.PIECE]: 'bg-purple-100 text-purple-700',
  [UNIT_TYPES.BUNCH]: 'bg-teal-100 text-teal-700',
  [UNIT_TYPES.GRAMS]: 'bg-blue-100 text-blue-700',
}

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
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-xl sm:w-96"
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </>
  )
}

function ProductModal ({ mode, product, onClose, onSaved, t }) {
  const [nameEn, setNameEn] = useState(product?.nameEn ?? '')
  const [nameTa, setNameTa] = useState(product?.nameTa ?? '')
  const [defaultUnit, setDefaultUnit] = useState(product?.defaultUnit ?? UNIT_TYPES.KG)
  const [saving, setSaving] = useState(false)
  const [generalError, setGeneralError] = useState(null)

  const isAdd = mode === 'add'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setGeneralError(null)

    try {
      const body = {
        nameEn: nameEn.trim(),
        defaultUnit,
      }
      if (nameTa.trim()) body.nameTa = nameTa.trim()

      if (isAdd) {
        await apiPost('/api/v1/catalogue', body)
      } else {
        await apiPatch(`/api/v1/catalogue/${product.productId}`, body)
      }
      onSaved()
    } catch (err) {
      setGeneralError(apiErrorTranslationKey(err))
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = nameEn.trim().length > 0 && !saving

  const unitLabel = (unit) => {
    const keys = {
      [UNIT_TYPES.KG]: 'unit.kg',
      [UNIT_TYPES.PIECE]: 'unit.piece',
      [UNIT_TYPES.BUNCH]: 'unit.bunch',
      [UNIT_TYPES.GRAMS]: 'unit.100g',
    }
    return t(keys[unit] ?? unit)
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#E8E4DF] px-4 py-4">
        <h2 className="text-base font-semibold text-gray-900">
          {isAdd ? t('registration.catalogue.add_button') : t('action.edit')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label={t('action.close')}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('registration.catalogue.name_en_label')}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder={t('field.product_name_en')}
            required
            className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('registration.catalogue.name_ta_label')}
          </label>
          <input
            type="text"
            value={nameTa}
            onChange={(e) => setNameTa(e.target.value)}
            placeholder={t('action.add') + ' (Optional)'}
            className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('registration.catalogue.unit_label')}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <select
            value={defaultUnit}
            onChange={(e) => setDefaultUnit(e.target.value)}
            required
            className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B]"
          >
            {ALL_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabel(unit)}
              </option>
            ))}
          </select>
        </div>

        {generalError && (
          <p className="text-sm text-red-600" role="alert">{t(generalError)}</p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D5A1B] py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />}
            {t('action.save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-[#E8E4DF] bg-white py-3 text-sm font-medium text-gray-700"
          >
            {t('action.cancel')}
          </button>
        </div>
      </form>
    </>
  )
}

function UnitBadge ({ unit, t }) {
  const unitLabelKeys = {
    [UNIT_TYPES.KG]: 'unit.kg',
    [UNIT_TYPES.PIECE]: 'unit.piece',
    [UNIT_TYPES.BUNCH]: 'unit.bunch',
    [UNIT_TYPES.GRAMS]: 'unit.100g',
  }
  const cls = UNIT_BADGE_CLASS[unit] ?? 'bg-gray-100 text-gray-600'
  const label = unitLabelKeys[unit] ? t(unitLabelKeys[unit]) : unit

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function ProductRow ({ product, onEdit, onToggleActive, pendingDeactivateId, setPendingDeactivateId, t }) {
  const isPending = pendingDeactivateId === product.productId

  const handleDeactivateClick = () => {
    if (isPending) {
      onToggleActive(product)
      setPendingDeactivateId(null)
    } else {
      setPendingDeactivateId(product.productId)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 px-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{product.nameEn}</p>
        <p className="text-xs text-gray-500">
          {product.nameTa && product.nameTa.trim() ? product.nameTa : '—'}
        </p>
      </div>

      <UnitBadge unit={product.defaultUnit} t={t} />

      <div className="shrink-0">
        {product.active !== false ? (
          <span className="bg-green-100 text-green-700 text-xs rounded-full px-2 py-0.5">
            {t('status.active')}
          </span>
        ) : (
          <span className="bg-gray-100 text-gray-500 text-xs rounded-full px-2 py-0.5">
            {t('status.inactive')}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(product)}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label={t('action.edit')}
        >
          <Pencil size={16} strokeWidth={1.5} />
        </button>

        {isPending ? (
          <button
            type="button"
            onClick={handleDeactivateClick}
            className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700"
          >
            {t('registration.confirm_deactivate_label')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDeactivateClick}
            className="rounded-full border border-[#E8E4DF] px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-400"
          >
            {product.active !== false
              ? t('registration.deactivate_label')
              : t('registration.reactivate_label')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function CatalogueManagement () {
  const { t } = useLang()
  const { state } = useWeekState()
  const navigate = useNavigate()

  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [editingProduct, setEditingProduct] = useState(null)
  const [pendingDeactivateId, setPendingDeactivateId] = useState(null)
  const [toastKey, setToastKey] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((key) => {
    clearTimeout(toastTimer.current)
    setToastKey(key)
    toastTimer.current = setTimeout(() => setToastKey(null), TOAST_DISMISS_MS)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await apiGet('/api/v1/catalogue')
      setProducts(data.products ?? [])
    } catch (err) {
      setLoadError(apiErrorTranslationKey(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const handleContainerClick = useCallback(() => {
    setPendingDeactivateId(null)
  }, [])

  const filtered = showInactive ? products : products.filter((p) => p.active !== false)

  const handleEdit = (product) => {
    setEditingProduct(product)
    setModalMode('edit')
  }

  const handleAdd = () => {
    setEditingProduct(null)
    setModalMode('add')
  }

  const handleModalClose = () => {
    setModalMode(null)
    setEditingProduct(null)
  }

  const handleSaved = async () => {
    handleModalClose()
    await loadProducts()
    showToast('registration.save_success_product')
  }

  const handleToggleActive = async (product) => {
    try {
      await apiPatch(`/api/v1/catalogue/${product.productId}`, {
        active: product.active === false ? true : false,
      })
      await loadProducts()
    } catch {
      // silent
    }
  }

  return (
    <div
      className="min-h-full bg-[#F0EDE8] p-4 pb-24"
      onClick={handleContainerClick}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/operator/registrations')}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-white/60"
            aria-label={t('action.back')}
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            {t('registration.catalogue.title')}
          </h1>
          <StateMachineBadge state={state} />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAdd() }}
          className="flex items-center gap-1.5 rounded-xl bg-[#2D5A1B] px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          {t('registration.catalogue.add_button')}
        </button>
      </div>

      {/* Show inactive toggle */}
      <div className="mb-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-[#E8E4DF] accent-[#2D5A1B]"
          />
          {t('registration.catalogue.show_inactive')}
        </label>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{t(loadError)}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-sm text-gray-500">{t('empty.produce_list')}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E8E4DF] bg-white shadow-sm divide-y divide-[#E8E4DF]">
          {/* Table header */}
          <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid">
            <span>{t('registration.catalogue.name_en_label')} / {t('registration.catalogue.name_ta_label')}</span>
            <span>{t('registration.catalogue.unit_label')}</span>
            <span>{t('status.active')}</span>
            <span className="col-span-2">{t('action.edit')}</span>
          </div>
          {filtered.map((product) => (
            <ProductRow
              key={product.productId}
              product={product}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              pendingDeactivateId={pendingDeactivateId}
              setPendingDeactivateId={setPendingDeactivateId}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Slide-in modal */}
      <SlidePanel open={modalMode !== null} onClose={handleModalClose}>
        {modalMode !== null && (
          <ProductModal
            mode={modalMode}
            product={editingProduct}
            onClose={handleModalClose}
            onSaved={handleSaved}
            t={t}
          />
        )}
      </SlidePanel>

      {/* Toast */}
      {toastKey && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[#E8E4DF] bg-white p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-gray-800">{t(toastKey)}</p>
        </div>
      )}
    </div>
  )
}
