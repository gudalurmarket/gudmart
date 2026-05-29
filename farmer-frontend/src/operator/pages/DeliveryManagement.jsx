import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Package, Plus, Trash2 } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { UNIT_TYPES, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'

const TOAST_DISMISS_MS = 4000
const FCFS_TOAST_DISMISS_MS = 6000
const COPY_LABEL_RESET_MS = 1500

const UNIT_TRANSLATION_KEYS = {
  [UNIT_TYPES.KG]: 'unit.kg',
  [UNIT_TYPES.PIECE]: 'unit.piece',
  [UNIT_TYPES.BUNCH]: 'unit.bunch',
  [UNIT_TYPES.GRAMS]: 'unit.100g',
}

function translateWithFallback (t, primaryKey, fallbackKey) {
  const primary = t(primaryKey)
  if (primary !== primaryKey) return primary
  return fallbackKey ? t(fallbackKey) : primary
}

function roundQty (value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function calcBufferQty (totalOrderedQty, bufferPct) {
  return roundQty((totalOrderedQty * bufferPct) / 100, 2)
}

function calcOutgoingQty (totalOrderedQty, bufferQty) {
  return roundQty(totalOrderedQty + bufferQty, 2)
}

function newRowKey () {
  return `row-${crypto.randomUUID()}`
}

function newAssignmentId () {
  return crypto.randomUUID()
}

/**
 * @param {Array<object>} assignments
 * @param {string} productId
 */
function assignmentsForProduct (assignments, productId) {
  return assignments.filter((a) => a.productId === productId)
}

/**
 * @param {Array<object>} assignments
 * @param {string} productId
 */
function productMetaFromAssignments (assignments, productId) {
  const rows = assignmentsForProduct(assignments, productId)
  const first = rows[0]
  return {
    productName: first?.productName ?? productId,
    unit: first?.unit ?? UNIT_TYPES.KG,
    bufferPct: first?.bufferPct ?? 0,
  }
}

function buildInitialAssignmentRows (assignments, productId) {
  const rows = assignmentsForProduct(assignments, productId)
  if (rows.length === 0) {
    return [{ rowKey: newRowKey(), assignmentId: null, farmerId: '', qty: '' }]
  }
  return rows.map((row) => ({
    rowKey: row.assignmentId ?? newRowKey(),
    assignmentId: row.assignmentId ?? null,
    farmerId: row.farmerId ?? '',
    qty: row.outgoingQty != null ? String(row.outgoingQty) : '',
  }))
}

function formatQtyWithUnit (qty, unit, t) {
  const unitLabel = UNIT_TRANSLATION_KEYS[unit]
    ? t(UNIT_TRANSLATION_KEYS[unit])
    : unit
  return `${qty} ${unitLabel}`
}

function FarmerAssignmentRow ({
  row,
  farmers,
  unit,
  canRemove,
  onFarmerChange,
  onQtyChange,
  onRemove,
  t,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={row.farmerId}
        onChange={(e) => onFarmerChange(row.rowKey, e.target.value)}
        className="min-h-[44px] flex-1 rounded-lg border border-[#E8E4DF] px-2 py-2 text-sm"
      >
        <option value="">{t('field.farmer_name')}</option>
        {farmers.map((farmer) => (
          <option key={farmer.farmerId} value={farmer.farmerId}>
            {farmer.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          step="any"
          value={row.qty}
          onChange={(e) => onQtyChange(row.rowKey, e.target.value)}
          className="w-24 min-h-[44px] rounded-lg border border-[#E8E4DF] px-2 py-2 text-sm"
        />
        <span className="text-xs text-gray-500">
          {UNIT_TRANSLATION_KEYS[unit] ? t(UNIT_TRANSLATION_KEYS[unit]) : unit}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onRemove(row.rowKey)}
        disabled={!canRemove}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-red-400 disabled:opacity-30"
        aria-label={t('action.delete')}
      >
        <Trash2 size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}

function BufferCard ({
  item,
  productName,
  unit,
  bufferPct,
  assignmentRows,
  farmers,
  saving,
  cardErrorKey,
  onBufferPctChange,
  onFarmerChange,
  onQtyChange,
  onAddRow,
  onRemoveRow,
  onSave,
  t,
}) {
  const totalOrderedQty = item.totalOrderedQty ?? 0
  const bufferQty = calcBufferQty(totalOrderedQty, bufferPct)
  const outgoingQty = calcOutgoingQty(totalOrderedQty, bufferQty)

  const sumAssigned = assignmentRows.reduce((sum, row) => {
    const n = Number(row.qty)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  const hasVariance = roundQty(sumAssigned, 2) !== outgoingQty

  return (
    <div className="mb-3 rounded-xl border border-[#E8E4DF] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-[#2D5A1B]">{productName}</h3>
        <p className="text-sm text-gray-600">
          {totalOrderedQty} {UNIT_TRANSLATION_KEYS[unit] ? t(UNIT_TRANSLATION_KEYS[unit]) : unit}{' '}
          {t('delivery.total_ordered')}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">{t('delivery.buffer_pct_label')}</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={bufferPct}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onBufferPctChange(0)
              return
            }
            const n = Math.min(100, Math.max(0, Math.floor(Number(raw))))
            onBufferPctChange(Number.isFinite(n) ? n : 0)
          }}
          className="w-16 rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm"
        />
        <span className="text-gray-500">%</span>
        <span className="text-gray-600">
          {formatQtyWithUnit(bufferQty, unit, t)}
        </span>
        <span className="ml-2 text-gray-600">
          {t('delivery.outgoing_qty_label')}:{' '}
          <span className="font-medium text-gray-900">
            {formatQtyWithUnit(outgoingQty, unit, t)}
          </span>
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">
          {t('delivery.farmer_assignments_label')}
        </p>
        {assignmentRows.map((row) => (
          <FarmerAssignmentRow
            key={row.rowKey}
            row={row}
            farmers={farmers}
            unit={unit}
            canRemove={assignmentRows.length > 1}
            onFarmerChange={onFarmerChange}
            onQtyChange={onQtyChange}
            onRemove={onRemoveRow}
            t={t}
          />
        ))}
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[#2D5A1B]"
        >
          <Plus size={16} strokeWidth={1.5} />
          {t('delivery.add_farmer_assignment')}
        </button>
        {hasVariance && (
          <p className="text-sm text-amber-600" role="status">
            {t('delivery.assignment_variance_warning')}: {sumAssigned} / {outgoingQty}
          </p>
        )}
      </div>

      {cardErrorKey && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {t(cardErrorKey)}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-4 rounded-xl bg-[#2D5A1B] px-4 py-2.5 text-sm text-white disabled:opacity-60"
      >
        {t('action.save')}
      </button>
    </div>
  )
}

function buildFarmerItemLine (itemName, preorderQty, bufferQty, outgoingQty, unit) {
  return `${itemName} — ${preorderQty} + ${bufferQty} buffer = ${outgoingQty} ${unit}`
}

function CopyableFarmerOrder ({
  groupedByFarmer,
  exportLang,
  onExportLangChange,
  t,
}) {
  const [copiedFarmerId, setCopiedFarmerId] = useState(null)

  const handleCopy = async (farmerId, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFarmerId(farmerId)
      setTimeout(() => setCopiedFarmerId(null), COPY_LABEL_RESET_MS)
    } catch {
      setCopiedFarmerId(null)
    }
  }

  if (groupedByFarmer.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-[#E8E4DF] bg-white p-4">
      <h3 className="mb-3 font-semibold text-[#2D5A1B]">
        {t('delivery.farmer_order_export_title')}
      </h3>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => onExportLangChange('en')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            exportLang === 'en'
              ? 'bg-[#2D5A1B] text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('lang.english')}
        </button>
        <button
          type="button"
          onClick={() => onExportLangChange('ta')}
          className={`rounded-full px-3 py-1 text-xs font-medium font-tamil ${
            exportLang === 'ta'
              ? 'bg-[#2D5A1B] text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('lang.tamil')}
        </button>
      </div>
      <div className="space-y-4">
        {groupedByFarmer.map((group) => {
          const itemLines = group.items.map((item) =>
            buildFarmerItemLine(
              exportLang === 'ta' && item.nameTa ? item.nameTa : item.productName,
              item.preorderQty,
              item.bufferQty,
              item.outgoingQty,
              item.unit,
            ),
          )
          const farmerText = [group.farmerName, ...itemLines].join('\n')
          return (
            <div
              key={group.farmerId}
              className="rounded-lg border border-[#E8E4DF] bg-[#F0EDE8] p-3"
            >
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
                {farmerText}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(group.farmerId, farmerText)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#2D5A1B]"
              >
                <Copy size={16} strokeWidth={1.5} />
                {copiedFarmerId === group.farmerId
                  ? t('action.copied')
                  : t('action.copy')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeliveredQtyRow ({
  assignment,
  editable,
  draftQty,
  saving,
  rowErrorKey,
  onDraftChange,
  onSave,
  t,
}) {
  const savedQty = assignment.deliveredQty ?? 0
  const parsedDraft = draftQty === '' ? null : Number(draftQty)
  const displayQty = parsedDraft ?? savedQty
  const dirty =
    editable &&
    parsedDraft != null &&
    Number.isFinite(parsedDraft) &&
    roundQty(parsedDraft, 2) !== roundQty(savedQty, 2)

  const aggregated = assignment.aggregatedOrderedQty ?? 0
  let flag = null
  if (assignment.shortfallFlag) {
    flag = 'shortfall'
  } else if (displayQty > aggregated) {
    flag = 'overdelivery'
  } else if (displayQty < aggregated) {
    flag = 'shortfall'
  }

  const unit = assignment.unit ?? UNIT_TYPES.KG
  const unitLabel = UNIT_TRANSLATION_KEYS[unit]
    ? t(UNIT_TRANSLATION_KEYS[unit])
    : unit

  return (
    <div className="mb-2 rounded-xl border border-[#E8E4DF] bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{assignment.productName}</p>
          <p className="text-xs text-gray-500">{assignment.farmerName}</p>
          <p className="mt-1 text-sm text-gray-600">
            {t('delivery.expected_qty_label')}:{' '}
            {formatQtyWithUnit(assignment.outgoingQty ?? 0, unit, t)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {editable ? (
              <input
                type="number"
                min={0}
                step={0.1}
                value={draftQty}
                onChange={(e) => onDraftChange(assignment.assignmentId, e.target.value)}
                className="w-24 min-h-[44px] rounded-lg border border-[#E8E4DF] px-2 py-2 text-sm text-right"
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">{savedQty}</span>
            )}
            <span className="text-xs text-gray-500">{unitLabel}</span>
            {dirty && (
              <button
                type="button"
                onClick={() => onSave(assignment)}
                disabled={saving}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[#2D5A1B] disabled:opacity-50"
                aria-label={t('action.save')}
              >
                <Check size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
          {flag === 'shortfall' && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {t('delivery.shortfall_flag')}
            </span>
          )}
          {flag === 'overdelivery' && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              {t('delivery.overdelivery_flag')}
            </span>
          )}
        </div>
      </div>
      {rowErrorKey && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {t(rowErrorKey)}
        </p>
      )}
    </div>
  )
}

function PackingCustomerCard ({ customer, t }) {
  const lineItems = (customer.orders ?? []).flatMap((order) =>
    (order.lineItems ?? []).map((li) => ({
      ...li,
      orderStatus: order.status,
    })),
  )

  const primaryStatus = (customer.orders ?? [])[0]?.status ?? 'confirmed'
  const statusClass =
    primaryStatus === 'packed'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-green-100 text-green-700'
  const statusKey =
    primaryStatus === 'packed' ? 'order.status.packed' : 'order.status.confirmed'

  return (
    <div className="mb-3 rounded-xl border border-[#E8E4DF] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">{customer.customerName}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
          {t(statusKey)}
        </span>
      </div>
      {lineItems.length === 0 ? (
        <p className="text-sm text-gray-500">{t('delivery.packing_list_empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8E4DF] text-xs text-gray-500">
                <th className="pb-2 pr-2 font-medium">{t('delivery.packing_col_product')}</th>
                <th className="pb-2 pr-2 font-medium">{t('delivery.packing_col_ordered')}</th>
                <th className="pb-2 pr-2 font-medium">{t('delivery.packing_col_allocated')}</th>
                <th className="pb-2 font-medium">{t('field.unit')}</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, index) => {
                const shortfall =
                  li.allocatedQty != null &&
                  li.orderedQty != null &&
                  li.allocatedQty < li.orderedQty
                return (
                  <tr
                    key={`${li.productId}-${index}`}
                    className="border-b border-[#E8E4DF]/60 last:border-0"
                  >
                    <td className="py-2 pr-2 text-gray-900">{li.nameEn ?? li.productId}</td>
                    <td className="py-2 pr-2 text-gray-700">{li.orderedQty}</td>
                    <td
                      className={`py-2 pr-2 ${
                        shortfall ? 'font-medium text-amber-700' : 'text-gray-700'
                      }`}
                    >
                      {li.allocatedQty}
                    </td>
                    <td className="py-2 text-gray-600">
                      {UNIT_TRANSLATION_KEYS[li.unit]
                        ? t(UNIT_TRANSLATION_KEYS[li.unit])
                        : li.unit}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function DeliveryManagement () {
  const { t, lang } = useLang()

  const [weekId, setWeekId] = useState(null)
  const [currentState, setCurrentState] = useState(null)
  const [marketDate, setMarketDate] = useState(null)

  const [assignments, setAssignments] = useState([])
  const [produceItems, setProduceItems] = useState([])
  const [packingCustomers, setPackingCustomers] = useState([])
  const [farmers, setFarmers] = useState([])

  const [bufferPctByProduct, setBufferPctByProduct] = useState({})
  const [assignmentRowsByProduct, setAssignmentRowsByProduct] = useState({})
  const [deliveredDrafts, setDeliveredDrafts] = useState({})
  const [exportLang, setExportLang] = useState('en')

  const [subTab, setSubTab] = useState('delivered')
  const [loading, setLoading] = useState(true)
  const [loadErrorKey, setLoadErrorKey] = useState(null)

  const [savingProductId, setSavingProductId] = useState(null)
  const [cardErrors, setCardErrors] = useState({})
  const [savingAssignmentId, setSavingAssignmentId] = useState(null)
  const [rowErrors, setRowErrors] = useState({})

  const [toast, setToast] = useState(null)
  const [toastDuration, setToastDuration] = useState(TOAST_DISMISS_MS)

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), toastDuration)
    return () => clearTimeout(timer)
  }, [toast, toastDuration])

  const showReadOnlyNotice =
    currentState != null &&
    currentState !== WEEK_STATES.LOCKED &&
    currentState !== WEEK_STATES.DELIVERY

  const isLockedView = currentState === WEEK_STATES.LOCKED
  const isDeliveryView = currentState === WEEK_STATES.DELIVERY
  const deliveredEditable = isDeliveryView

  const hasDeliveredData = assignments.length > 0
  const hasPackingData = packingCustomers.length > 0

  const showSubTabs =
    !isLockedView &&
    (isDeliveryView || hasDeliveredData || hasPackingData)

  const initializeFromDelivery = useCallback((items, assignmentList) => {
    const pct = {}
    const rows = {}
    for (const item of items) {
      const meta = productMetaFromAssignments(assignmentList, item.productId)
      pct[item.productId] = meta.bufferPct
      rows[item.productId] = buildInitialAssignmentRows(assignmentList, item.productId)
    }
    setBufferPctByProduct(pct)
    setAssignmentRowsByProduct(rows)

    const drafts = {}
    for (const asgn of assignmentList) {
      drafts[asgn.assignmentId] =
        asgn.deliveredQty != null ? String(asgn.deliveredQty) : '0'
    }
    setDeliveredDrafts(drafts)
  }, [])

  const loadWeekData = useCallback(async (activeWeekId) => {
    const [deliveryData, packingData, farmersData] = await Promise.all([
      apiGet(`/api/v1/weeks/${activeWeekId}/delivery`),
      apiGet(`/api/v1/weeks/${activeWeekId}/packing`),
      apiGet('/api/v1/farmers?type=outstation&status=active'),
    ])

    const assignmentList = deliveryData.assignments ?? []
    const items = deliveryData.items ?? []

    setAssignments(assignmentList)
    setProduceItems(items)
    setPackingCustomers(packingData.customers ?? [])
    setFarmers(farmersData.farmers ?? [])
    initializeFromDelivery(items, assignmentList)
  }, [initializeFromDelivery])

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
        setAssignments([])
        setProduceItems([])
        setPackingCustomers([])
        return
      }
      const id = active.weekId ?? active.week_id
      setWeekId(id)
      setCurrentState(active.state)
      setMarketDate(active.marketDate ?? active.market_date)
      await loadWeekData(id)
    } catch (err) {
      setLoadErrorKey(apiErrorTranslationKey(err))
    } finally {
      setLoading(false)
    }
  }, [loadWeekData])

  useEffect(() => {
    loadPage()
  }, [loadPage])

  const farmerNameById = useMemo(
    () => new Map(farmers.map((f) => [f.farmerId, f.name])),
    [farmers],
  )

  const exportGroupedByFarmer = useMemo(() => {
    const groups = new Map()
    for (const item of produceItems) {
      const productId = item.productId
      const meta = productMetaFromAssignments(assignments, productId)
      const pct = bufferPctByProduct[productId] ?? meta.bufferPct ?? 0
      const totalOrdered = item.totalOrderedQty ?? 0
      const bufferQty = calcBufferQty(totalOrdered, pct)
      const rows = assignmentRowsByProduct[productId] ?? []

      for (const row of rows) {
        if (!row.farmerId) continue
        const qty = Number(row.qty)
        if (!Number.isFinite(qty) || qty <= 0) continue

        if (!groups.has(row.farmerId)) {
          groups.set(row.farmerId, {
            farmerId: row.farmerId,
            farmerName: farmerNameById.get(row.farmerId) ?? row.farmerId,
            items: [],
          })
        }
        groups.get(row.farmerId).items.push({
          productId,
          productName: meta.productName,
          nameTa: null,
          preorderQty: totalOrdered,
          bufferQty,
          outgoingQty: qty,
          unit: meta.unit,
        })
      }
    }
    return [...groups.values()].sort((a, b) =>
      a.farmerName.localeCompare(b.farmerName),
    )
  }, [
    produceItems,
    assignments,
    bufferPctByProduct,
    assignmentRowsByProduct,
    farmerNameById,
  ])

  const handleBufferPctChange = (productId, value) => {
    setBufferPctByProduct((prev) => ({ ...prev, [productId]: value }))
  }

  const handleAddAssignmentRow = (productId) => {
    setAssignmentRowsByProduct((prev) => ({
      ...prev,
      [productId]: [
        ...(prev[productId] ?? []),
        { rowKey: newRowKey(), assignmentId: null, farmerId: '', qty: '' },
      ],
    }))
  }

  const handleRemoveAssignmentRow = (productId, rowKey) => {
    setAssignmentRowsByProduct((prev) => {
      const rows = prev[productId] ?? []
      if (rows.length <= 1) return prev
      return {
        ...prev,
        [productId]: rows.filter((r) => r.rowKey !== rowKey),
      }
    })
  }

  const handleFarmerChange = (productId, rowKey, farmerId) => {
    setAssignmentRowsByProduct((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? []).map((r) =>
        r.rowKey === rowKey ? { ...r, farmerId } : r,
      ),
    }))
  }

  const handleAssignmentQtyChange = (productId, rowKey, qty) => {
    setAssignmentRowsByProduct((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? []).map((r) =>
        r.rowKey === rowKey ? { ...r, qty } : r,
      ),
    }))
  }

  const handleSaveBufferCard = async (item) => {
    const productId = item.productId
    const totalOrderedQty = item.totalOrderedQty ?? 0
    const bufferPct = bufferPctByProduct[productId] ?? 0
    const bufferQty = calcBufferQty(totalOrderedQty, bufferPct)
    const rows = assignmentRowsByProduct[productId] ?? []

    setSavingProductId(productId)
    setCardErrors((prev) => ({ ...prev, [productId]: null }))

    try {
      const updatedAssignments = [...assignments]

      for (const row of rows) {
        if (!row.farmerId) {
          setCardErrors((prev) => ({ ...prev, [productId]: 'error.validation' }))
          return
        }
        const rowOutgoing = Number(row.qty)
        if (!Number.isFinite(rowOutgoing) || rowOutgoing < 0) {
          setCardErrors((prev) => ({ ...prev, [productId]: 'error.validation' }))
          return
        }

        const assignmentId = row.assignmentId ?? newAssignmentId()
        const result = await apiPatch(
          `/api/v1/weeks/${weekId}/delivery/${assignmentId}`,
          {
            farmerId: row.farmerId,
            productId,
            preorderQty: totalOrderedQty,
            bufferPct,
            bufferQty,
            outgoingQty: rowOutgoing,
          },
        )

        const idx = updatedAssignments.findIndex(
          (a) => a.assignmentId === assignmentId,
        )
        const merged = {
          assignmentId: result.assignmentId ?? assignmentId,
          farmerId: row.farmerId,
          productId,
          farmerName: result.farmerName ?? farmerNameById.get(row.farmerId),
          productName: result.productName ?? productMetaFromAssignments(assignments, productId).productName,
          preorderQty: totalOrderedQty,
          bufferPct,
          bufferQty,
          outgoingQty: rowOutgoing,
          deliveredQty: result.deliveredQty ?? 0,
          unit: productMetaFromAssignments(assignments, productId).unit,
          aggregatedOrderedQty: totalOrderedQty,
          shortfallFlag: false,
        }
        if (idx >= 0) {
          updatedAssignments[idx] = { ...updatedAssignments[idx], ...merged }
        } else {
          updatedAssignments.push(merged)
        }
      }

      setAssignments(updatedAssignments)
      setAssignmentRowsByProduct((prev) => ({
        ...prev,
        [productId]: rows.map((row) => {
          const saved = updatedAssignments.find(
            (a) =>
              a.productId === productId &&
              a.farmerId === row.farmerId,
          )
          return {
            ...row,
            assignmentId: saved?.assignmentId ?? row.assignmentId,
            rowKey: saved?.assignmentId ?? row.rowKey,
          }
        }),
      }))

      setToastDuration(TOAST_DISMISS_MS)
      setToast({ key: 'toast.assignment_saved' })
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [productId]: apiErrorTranslationKey(err),
      }))
    } finally {
      setSavingProductId(null)
    }
  }

  const handleDeliveredDraftChange = (assignmentId, value) => {
    setDeliveredDrafts((prev) => ({ ...prev, [assignmentId]: value }))
  }

  const handleSaveDeliveredQty = async (assignment) => {
    const draft = deliveredDrafts[assignment.assignmentId]
    const deliveredQty = Number(draft)
    if (!Number.isFinite(deliveredQty) || deliveredQty < 0) {
      setRowErrors((prev) => ({
        ...prev,
        [assignment.assignmentId]: 'error.validation',
      }))
      return
    }

    setSavingAssignmentId(assignment.assignmentId)
    setRowErrors((prev) => ({ ...prev, [assignment.assignmentId]: null }))

    try {
      const result = await apiPatch(
        `/api/v1/weeks/${weekId}/delivery/${assignment.assignmentId}`,
        { deliveredQty },
      )

      setAssignments((prev) =>
        prev.map((a) =>
          a.assignmentId === assignment.assignmentId
            ? {
                ...a,
                deliveredQty: result.deliveredQty ?? deliveredQty,
                shortfallFlag:
                  result.fcfsTriggered === true
                    ? true
                    : a.shortfallFlag,
              }
            : a,
        ),
      )
      setDeliveredDrafts((prev) => ({
        ...prev,
        [assignment.assignmentId]: String(result.deliveredQty ?? deliveredQty),
      }))

      if (result.fcfsTriggered === true) {
        const count = result.allocations?.length ?? 0
        setToastDuration(FCFS_TOAST_DISMISS_MS)
        setToast({
          message: `${t('toast.fcfs_reallocated')} — ${count} orders affected`,
        })
        const packingData = await apiGet(`/api/v1/weeks/${weekId}/packing`)
        setPackingCustomers(packingData.customers ?? [])
      } else {
        setToastDuration(TOAST_DISMISS_MS)
        setToast({ key: 'toast.delivery_qty_saved' })
      }
    } catch (err) {
      setRowErrors((prev) => ({
        ...prev,
        [assignment.assignmentId]: apiErrorTranslationKey(err),
      }))
    } finally {
      setSavingAssignmentId(null)
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
    <div className="min-h-full space-y-4 bg-[#F0EDE8] px-4 pb-8 pt-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <StateMachineBadge state={currentState} />
        {marketDate && (
          <p className="text-right text-sm text-gray-600">
            {formatMarketDate(marketDate, lang)}
          </p>
        )}
      </header>

      {showReadOnlyNotice && (
        <p className="text-sm text-amber-600">{t('delivery.read_only_notice')}</p>
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
          {isLockedView && (
            <div className="space-y-4">
              {produceItems.length === 0 ? (
                <div className="rounded-xl border border-[#E8E4DF] bg-white p-4 text-sm text-gray-600">
                  {t('empty.produce_list')}
                </div>
              ) : (
                produceItems.map((item) => {
                  const meta = productMetaFromAssignments(assignments, item.productId)
                  return (
                    <BufferCard
                      key={item.productId}
                      item={item}
                      productName={meta.productName}
                      unit={meta.unit}
                      bufferPct={bufferPctByProduct[item.productId] ?? meta.bufferPct}
                      assignmentRows={
                        assignmentRowsByProduct[item.productId] ??
                        buildInitialAssignmentRows(assignments, item.productId)
                      }
                      farmers={farmers}
                      saving={savingProductId === item.productId}
                      cardErrorKey={cardErrors[item.productId]}
                      onBufferPctChange={(value) =>
                        handleBufferPctChange(item.productId, value)
                      }
                      onFarmerChange={(rowKey, farmerId) =>
                        handleFarmerChange(item.productId, rowKey, farmerId)
                      }
                      onQtyChange={(rowKey, qty) =>
                        handleAssignmentQtyChange(item.productId, rowKey, qty)
                      }
                      onAddRow={() => handleAddAssignmentRow(item.productId)}
                      onRemoveRow={(rowKey) =>
                        handleRemoveAssignmentRow(item.productId, rowKey)
                      }
                      onSave={() => handleSaveBufferCard(item)}
                      t={t}
                    />
                  )
                })
              )}
              <CopyableFarmerOrder
                groupedByFarmer={exportGroupedByFarmer}
                exportLang={exportLang}
                onExportLangChange={setExportLang}
                t={t}
              />
            </div>
          )}

          {showSubTabs && (
            <>
              <div className="flex gap-1 rounded-xl border border-[#E8E4DF] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setSubTab('delivered')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    subTab === 'delivered'
                      ? 'bg-[#2D5A1B] text-white'
                      : 'text-gray-600'
                  }`}
                >
                  {t('delivery.tab_delivered_quantities')}
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('packing')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    subTab === 'packing'
                      ? 'bg-[#2D5A1B] text-white'
                      : 'text-gray-600'
                  }`}
                >
                  {t('delivery.tab_packing_list')}
                </button>
              </div>

              {subTab === 'delivered' && (
                <div>
                  {assignments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E8E4DF] bg-white py-16">
                      <Package size={32} strokeWidth={1.5} className="text-gray-300" />
                      <p className="mt-3 text-sm text-gray-500">
                        {t('empty.delivery_list')}
                      </p>
                    </div>
                  ) : (
                    assignments.map((assignment) => (
                      <DeliveredQtyRow
                        key={assignment.assignmentId}
                        assignment={assignment}
                        editable={deliveredEditable}
                        draftQty={
                          deliveredDrafts[assignment.assignmentId] ??
                          String(assignment.deliveredQty ?? 0)
                        }
                        saving={savingAssignmentId === assignment.assignmentId}
                        rowErrorKey={rowErrors[assignment.assignmentId]}
                        onDraftChange={handleDeliveredDraftChange}
                        onSave={handleSaveDeliveredQty}
                        t={t}
                      />
                    ))
                  )}
                </div>
              )}

              {subTab === 'packing' && (
                <div>
                  {packingCustomers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E8E4DF] bg-white py-16">
                      <Package size={32} strokeWidth={1.5} className="text-gray-300" />
                      <p className="mt-3 text-sm text-gray-500">
                        {t('delivery.packing_list_empty')}
                      </p>
                    </div>
                  ) : (
                    packingCustomers.map((customer) => (
                      <PackingCustomerCard
                        key={customer.customerId}
                        customer={customer}
                        t={t}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

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
