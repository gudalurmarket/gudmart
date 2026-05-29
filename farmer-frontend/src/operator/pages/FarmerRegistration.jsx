import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Plus, X } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch, apiPost, DuplicatePhoneError } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { FARMER_TYPES } from '../../shared/lib/constants.js'
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
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-xl sm:w-96"
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </>
  )
}

function FarmerModal ({ mode, farmer, onClose, onSaved, t }) {
  const [name, setName] = useState(farmer?.name ?? '')
  const [phone, setPhone] = useState(farmer?.phone ?? '')
  const [location, setLocation] = useState(farmer?.location ?? '')
  const [farmerType, setFarmerType] = useState(farmer?.farmerType ?? FARMER_TYPES.OUTSTATION)
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
        await apiPost('/api/v1/farmers', {
          name: name.trim(),
          phone: phone.trim(),
          location: location.trim(),
          farmerType,
        })
      } else {
        await apiPatch(`/api/v1/farmers/${farmer.farmerId}`, {
          name: name.trim(),
          phone: phone.trim(),
          location: location.trim(),
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

  const canSubmit =
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    location.trim().length > 0 &&
    !saving

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#E8E4DF] px-4 py-4">
        <h2 className="text-base font-semibold text-gray-900">
          {isAdd ? t('registration.farmer.add_button') : t('action.edit')}
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
            {t('registration.farmer.name_label')}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('field.farmer_name')}
            required
            className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('registration.farmer.phone_label')}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setDupError(false) }}
            placeholder="+91XXXXXXXXXX"
            required
            className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B] ${dupError ? 'border-red-400 bg-red-50' : 'border-[#E8E4DF] bg-white'}`}
          />
          {dupError && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {t('registration.farmer.duplicate_phone_error')}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('registration.farmer.location_label')}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('field.farmer_location')}
            required
            className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {t('registration.farmer.type_label')}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <select
            value={farmerType}
            onChange={(e) => setFarmerType(e.target.value)}
            disabled={!isAdd}
            required
            className="w-full rounded-xl border border-[#E8E4DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2D5A1B] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value={FARMER_TYPES.OUTSTATION}>
              {t('registration.farmer.type_outstation')}
            </option>
            <option value={FARMER_TYPES.LOCAL}>
              {t('registration.farmer.type_local')}
            </option>
          </select>
          {!isAdd && (
            <p className="mt-1 text-xs text-gray-400">
              {t('registration.farmer.type_edit_disabled_hint')}
            </p>
          )}
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

function TypeBadge ({ farmerType, t }) {
  if (farmerType === FARMER_TYPES.OUTSTATION) {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
        {t('registration.farmer.type_outstation')}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
      {t('registration.farmer.type_local')}
    </span>
  )
}

function FarmerRow ({ farmer, onEdit, onToggleActive, pendingDeactivateId, setPendingDeactivateId, t }) {
  const isPending = pendingDeactivateId === farmer.farmerId

  const handleDeactivateClick = () => {
    if (isPending) {
      onToggleActive(farmer)
      setPendingDeactivateId(null)
    } else {
      setPendingDeactivateId(farmer.farmerId)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 px-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{farmer.name}</p>
        <p className="text-xs text-gray-500">{farmer.phone}</p>
        {farmer.location && (
          <p className="text-xs text-gray-400">{farmer.location}</p>
        )}
      </div>

      <TypeBadge farmerType={farmer.farmerType} t={t} />

      <div className="shrink-0">
        {farmer.active !== false ? (
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
          onClick={() => onEdit(farmer)}
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
            {farmer.active !== false
              ? t('registration.deactivate_label')
              : t('registration.reactivate_label')}
          </button>
        )}
      </div>
    </div>
  )
}

const TYPE_FILTERS = ['all', FARMER_TYPES.OUTSTATION, FARMER_TYPES.LOCAL]

export default function FarmerRegistration () {
  const { t } = useLang()
  const { state } = useWeekState()
  const navigate = useNavigate()

  const [farmers, setFarmers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [editingFarmer, setEditingFarmer] = useState(null)
  const [pendingDeactivateId, setPendingDeactivateId] = useState(null)
  const [toastKey, setToastKey] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((key) => {
    clearTimeout(toastTimer.current)
    setToastKey(key)
    toastTimer.current = setTimeout(() => setToastKey(null), TOAST_DISMISS_MS)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const loadFarmers = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const data = await apiGet(`/api/v1/farmers${qs}`)
      setFarmers(data.farmers ?? [])
    } catch (err) {
      setLoadError(apiErrorTranslationKey(err))
    } finally {
      setIsLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    loadFarmers()
  }, [loadFarmers])

  const handleContainerClick = useCallback(() => {
    setPendingDeactivateId(null)
  }, [])

  const filtered = showInactive ? farmers : farmers.filter((f) => f.active !== false)

  const handleEdit = (farmer) => {
    setEditingFarmer(farmer)
    setModalMode('edit')
  }

  const handleAdd = () => {
    setEditingFarmer(null)
    setModalMode('add')
  }

  const handleModalClose = () => {
    setModalMode(null)
    setEditingFarmer(null)
  }

  const handleSaved = async () => {
    handleModalClose()
    await loadFarmers()
    showToast('registration.save_success_farmer')
  }

  const handleToggleActive = async (farmer) => {
    try {
      await apiPatch(`/api/v1/farmers/${farmer.farmerId}`, {
        active: farmer.active === false ? true : false,
      })
      await loadFarmers()
    } catch {
      // silent
    }
  }

  const filterLabel = (type) => {
    if (type === 'all') return t('registration.filter.all')
    if (type === FARMER_TYPES.OUTSTATION) return t('registration.farmer.type_outstation')
    return t('registration.farmer.type_local')
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
            {t('registration.farmer.title')}
          </h1>
          <StateMachineBadge state={state} />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAdd() }}
          className="flex items-center gap-1.5 rounded-xl bg-[#2D5A1B] px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          {t('registration.farmer.add_button')}
        </button>
      </div>

      {/* Filter tabs + show inactive */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-[#E8E4DF] bg-white p-1">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={(e) => { e.stopPropagation(); setTypeFilter(type) }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === type
                  ? 'bg-[#2D5A1B] text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {filterLabel(type)}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-[#E8E4DF] accent-[#2D5A1B]"
          />
          {t('registration.farmer.show_inactive')}
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
          <p className="text-sm text-gray-500">{t('empty.farmer_list')}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E8E4DF] bg-white shadow-sm divide-y divide-[#E8E4DF]">
          {filtered.map((farmer) => (
            <FarmerRow
              key={farmer.farmerId}
              farmer={farmer}
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
          <FarmerModal
            mode={modalMode}
            farmer={editingFarmer}
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
