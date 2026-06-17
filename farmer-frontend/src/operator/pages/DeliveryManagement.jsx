import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Loader2, Package, Plus, SearchX, Trash2 } from 'lucide-react'
import { subscribeActiveWeekChanged } from '../../shared/hooks/useWeekState.js'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet, apiPatch } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { UNIT_TYPES, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'
import { translations } from '../../shared/lib/translations.js'

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

function isIntegerUnit (unit) {
  return unit === UNIT_TYPES.PIECE || unit === UNIT_TYPES.BUNCH
}

function qtyInputStep (unit) {
  return isIntegerUnit(unit) ? 1 : 0.01
}

/**
 * @param {string} raw
 * @param {string} unit
 * @returns {number|null}
 */
function parseQtyForUnit (raw, unit) {
  if (raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  if (isIntegerUnit(unit)) {
    if (!Number.isInteger(n)) return null
    return n
  }
  return roundQty(n, 2)
}

function newRowKey () {
  return `row-${crypto.randomUUID()}`
}

function newAssignmentId () {
  return crypto.randomUUID()
}

function localizedProductName (item, lang) {
  if (lang === 'ta' && item.nameTa) return item.nameTa
  return item.nameEn ?? item.productName ?? item.productId ?? ''
}

function tForLang (key, lang) {
  return translations[key]?.[lang] ?? key
}

function applyTemplate (template, vars) {
  return Object.entries(vars).reduce(
    (str, [varKey, value]) => str.replaceAll(`{{${varKey}}}`, String(value)),
    template,
  )
}

function unitLabelForLang (unit, lang) {
  const key = UNIT_TRANSLATION_KEYS[unit]
  return key ? tForLang(key, lang) : unit
}

const PRODUCT_DOT_PALETTE = [
  '#e05c5c',
  '#e08835',
  '#c0aa1a',
  '#38a85e',
  '#3880b5',
  '#7e51c5',
  '#b54c9c',
  '#3da8a0',
]

function farmerInitials (name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function toLocalMarketDate (marketDate) {
  if (marketDate == null || marketDate === '') return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(marketDate))
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const parsed = new Date(marketDate)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

function formatWeekDateRange (marketDate, lang) {
  const end = toLocalMarketDate(marketDate)
  if (!end) return ''
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return `${formatMarketDate(start, lang)} → ${formatMarketDate(end, lang)}`
}

function productDotColor (productId) {
  let hash = 0
  for (let i = 0; i < productId.length; i++) {
    hash += productId.charCodeAt(i)
  }
  return PRODUCT_DOT_PALETTE[hash % PRODUCT_DOT_PALETTE.length]
}

function buildFarmerCopyText (group, lang, marketDate) {
  const formattedDate = formatWeekDateRange(marketDate, lang)
  const headerTpl = tForLang('template.farmer_order.header', lang)
  const header = applyTemplate(headerTpl, { farmerName: group.farmerName, marketDate: formattedDate })
  const itemLines = group.items.map((item) => {
    const name = localizedProductName(item, lang)
    const unit = unitLabelForLang(item.unit, lang)
    const lineTpl = tForLang('template.farmer_order.item_line', lang)
    return applyTemplate(lineTpl, {
      productName: name,
      outgoingQty: item.outgoingQty ?? 0,
      unit,
    })
  })
  const totalOutgoing = roundQty(group.items.reduce((s, i) => s + (i.outgoingQty ?? 0), 0), 2)
  const footerTpl = tForLang('template.farmer_order.footer', lang)
  const footer = applyTemplate(footerTpl, { totalOutgoing })
  return [header.trim(), ...itemLines, footer.trim()].join('\n')
}

/**
 * @param {Array<object>} assignments
 * @param {string} productId
 */
function assignmentsForProduct (assignments, productId) {
  return assignments.filter((a) => a.productId === productId)
}

function shouldShowAssignmentCard (item, assignmentRows) {
  if ((item.totalOrderedQty ?? 0) > 0) return true
  return (assignmentRows ?? []).some((row) => {
    if (row.assignmentId) return true
    if (row.farmerId) return true
    const qty = Number(row.qty)
    return Number.isFinite(qty) && qty > 0
  })
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
        className="min-h-[44px] flex-1 rounded-lg border border-[--color-border] px-2 py-2 text-sm"
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
          step={qtyInputStep(unit)}
          value={row.qty}
          onChange={(e) => onQtyChange(row.rowKey, e.target.value)}
          className="w-24 min-h-[44px] rounded-lg border border-[--color-border] px-2 py-2 text-sm"
        />
        <span className="text-xs text-[--color-text-secondary]">
          {UNIT_TRANSLATION_KEYS[unit] ? t(UNIT_TRANSLATION_KEYS[unit]) : unit}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onRemove(row.rowKey)}
        disabled={!canRemove}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[--color-error] disabled:opacity-30"
        aria-label={t('action.delete')}
      >
        <Trash2 size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}

function AssignmentCard ({
  item,
  productName,
  unit,
  assignmentRows,
  farmers,
  saving,
  cardErrorKey,
  onFarmerChange,
  onQtyChange,
  onAddRow,
  onRemoveRow,
  onSave,
  t,
}) {
  const totalOrderedQty = item.totalOrderedQty ?? 0
  const unitLabel = UNIT_TRANSLATION_KEYS[unit] ? t(UNIT_TRANSLATION_KEYS[unit]) : unit

  const sumAssigned = assignmentRows.reduce((sum, row) => {
    const n = Number(row.qty)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  const hasVariance = roundQty(sumAssigned, 2) !== roundQty(totalOrderedQty, 2)

  return (
    <div className="mb-3 rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-[--color-primary]">{productName}</h3>
        <p className="text-sm text-[--color-text-secondary]">
          {totalOrderedQty} {unitLabel}{' '}
          {t('delivery.total_ordered')}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-[--color-text-secondary]">
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
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[--color-primary]"
        >
          <Plus size={16} strokeWidth={1.5} />
          {t('delivery.add_farmer_assignment')}
        </button>
        {hasVariance && (
          <p className="text-sm text-[--color-warning]" role="status">
            {t('delivery.assignment_variance_warning')}: {sumAssigned} / {totalOrderedQty}
          </p>
        )}
      </div>

      {cardErrorKey && (
        <p className="mt-2 text-sm text-[--color-error]" role="alert">
          {t(cardErrorKey)}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-4 rounded-xl bg-[--color-primary] px-4 py-2.5 text-sm text-[--color-text-inverse] disabled:opacity-60"
      >
        {t('action.save')}
      </button>
    </div>
  )
}

function StatChip ({ label, value }) {
  return (
    <div className="inline-flex items-baseline gap-1.5 rounded-full border border-[--color-border] bg-[--color-surface] px-3 py-1.5 text-sm">
      <span className="text-[--color-text-secondary]">{label}</span>
      <span className="font-semibold tabular-nums text-[--color-text-primary]">{value}</span>
    </div>
  )
}

function FarmerSummaryCard ({ group, lang, marketDate, t, copied, onCopy }) {
  const maxOutgoing = group.items.reduce((m, i) => Math.max(m, i.outgoingQty ?? 0), 0)
  const totalOutgoing = roundQty(group.items.reduce((s, i) => s + (i.outgoingQty ?? 0), 0), 2)
  const copyText = buildFarmerCopyText(group, lang, marketDate)
  const isTa = lang === 'ta'
  const itemCountLabel = applyTemplate(t('delivery.summary.line_item_count'), {
    count: group.items.length,
  })
  const whatsAppHref = group.phone
    ? `https://wa.me/${group.phone.replace(/\D/g, '')}?text=${encodeURIComponent(copyText)}`
    : null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[--color-border] bg-[--color-surface]">
      {/* Card header */}
      <div className="flex items-start gap-3 border-b border-[--color-border] p-4">
        <div
          aria-hidden
          className="flex h-10 w-10 flex-shrink-0 select-none items-center justify-center rounded-lg bg-[--color-primary-light] text-sm font-bold text-[--color-primary]"
        >
          {farmerInitials(group.farmerName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold leading-tight text-[--color-text-primary]${isTa ? ' font-tamil' : ''}`}>
            {group.farmerName}
          </p>
          {group.location ? (
            <p className="mt-0.5 text-xs text-[--color-text-secondary]">{group.location}</p>
          ) : null}
        </div>
      </div>

      {/* Produce rows */}
      <div className="flex-1 space-y-3 p-4">
        {group.items.map((item) => {
          const dotColor = productDotColor(item.productId)
          const productName = localizedProductName(item, lang)
          const unitLabel = UNIT_TRANSLATION_KEYS[item.unit]
            ? tForLang(UNIT_TRANSLATION_KEYS[item.unit], lang)
            : item.unit
          const barPct =
            maxOutgoing > 0
              ? Math.min(100, Math.round(((item.outgoingQty ?? 0) / maxOutgoing) * 100))
              : 0

          return (
            <div key={item.productId}>
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
                <span
                  className={`flex-1 truncate text-sm text-[--color-text-primary]${isTa ? ' font-tamil' : ''}`}
                >
                  {productName}
                </span>
                <span className="flex-shrink-0 text-sm font-medium tabular-nums text-[--color-text-primary]">
                  {item.outgoingQty ?? 0} {unitLabel}
                </span>
              </div>
              {/* Proportional bar scaled to outgoing_qty relative to max on this card */}
              <div className="ml-4 mt-1.5 h-1 overflow-hidden rounded-full bg-[--color-border]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${barPct}%`, backgroundColor: dotColor }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between gap-2 border-t border-[--color-border] px-4 py-3">
        <p className="text-sm text-[--color-text-secondary]">
          {t('delivery.outgoing_qty_label')}:{' '}
          <span className="font-semibold tabular-nums text-[--color-text-primary]">
            {totalOutgoing} kg
          </span>
          <span className="ml-1 text-[--color-text-secondary]">· {itemCountLabel}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCopy(group.farmerId, copyText)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[--color-primary] hover:bg-[--color-primary-light]"
          >
            <Copy size={16} strokeWidth={1.5} />
            {copied ? t('action.copied') : t('action.copy')}
          </button>
          {whatsAppHref ? (
            <a
              href={whatsAppHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[--color-success] hover:bg-[--color-success-light]"
            >
              {t('action.whatsapp')}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FarmerOrderSummaryGrid ({ groupedByFarmer, farmers, lang, marketDate, t }) {
  const [search, setSearch] = useState('')
  const [copiedFarmerId, setCopiedFarmerId] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const groupsWithPhone = useMemo(() => {
    const phoneById = new Map((farmers ?? []).map((f) => [f.farmerId, f.phone ?? '']))
    return groupedByFarmer.map((g) => ({
      ...g,
      phone: g.phone ?? phoneById.get(g.farmerId) ?? '',
    }))
  }, [groupedByFarmer, farmers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groupsWithPhone
    return groupsWithPhone.filter((g) =>
      (g.farmerName ?? '').toLowerCase().includes(q),
    )
  }, [groupsWithPhone, search])

  const totalFarmers = groupsWithPhone.length
  const totalOutgoing = roundQty(
    groupsWithPhone.reduce(
      (sum, g) => sum + g.items.reduce((s, i) => s + (i.outgoingQty ?? 0), 0),
      0,
    ),
    2,
  )
  const distinctProducts = useMemo(() => {
    const ids = new Set()
    for (const g of groupsWithPhone) {
      for (const item of g.items) ids.add(item.productId)
    }
    return ids.size
  }, [groupsWithPhone])

  const handleCopy = async (farmerId, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFarmerId(farmerId)
      setCopiedAll(false)
      setTimeout(() => setCopiedFarmerId(null), COPY_LABEL_RESET_MS)
    } catch {
      setCopiedFarmerId(null)
    }
  }

  const handleCopyAll = async () => {
    const allText = filtered
      .map((group) => buildFarmerCopyText(group, lang, marketDate))
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(allText)
      setCopiedAll(true)
      setCopiedFarmerId(null)
      setTimeout(() => setCopiedAll(false), COPY_LABEL_RESET_MS)
    } catch {
      setCopiedAll(false)
    }
  }

  if (groupsWithPhone.length === 0) return null

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-[--color-primary]">
        {t('delivery.farmer_order_export_title')}
      </h3>

      {/* Summary stat chips */}
      <div className="flex flex-wrap gap-2">
        <StatChip label={t('delivery.summary.total_farmers')} value={totalFarmers} />
        <StatChip label={t('delivery.summary.total_outgoing')} value={`${totalOutgoing} kg`} />
        <StatChip label={t('delivery.summary.distinct_products')} value={distinctProducts} />
      </div>

      {/* Search / filter + copy all */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder={t('delivery.farmer_search.placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs flex-1 rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm text-[--color-text-primary] placeholder:text-[--color-text-disabled] focus:outline-none focus:ring-2 focus:ring-[--color-primary-light]"
        />
        <button
          type="button"
          onClick={handleCopyAll}
          disabled={filtered.length === 0}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[--color-border] bg-[--color-surface] px-3 py-2 text-sm font-medium text-[--color-primary] hover:bg-[--color-primary-light] disabled:opacity-50"
        >
          <Copy size={16} strokeWidth={1.5} />
          {copiedAll ? t('action.copied') : t('delivery.copy_all_assignments')}
        </button>
      </div>

      {/* Card grid — 1-col mobile, 2-col ≥768px */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((group) => (
            <FarmerSummaryCard
              key={group.farmerId}
              group={group}
              lang={lang}
              marketDate={marketDate}
              t={t}
              copied={copiedFarmerId === group.farmerId}
              onCopy={handleCopy}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-16 text-center">
          <SearchX size={32} strokeWidth={1.5} className="mb-3 text-[--color-text-disabled]" />
          <p className="text-sm text-[--color-text-secondary]">
            {t('delivery.farmer_search.no_results')}
          </p>
        </div>
      )}
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
  lang,
}) {
  const savedQty = assignment.deliveredQty ?? 0
  const parsedDraft = draftQty === '' ? null : Number(draftQty)
  const displayQty = parsedDraft ?? savedQty
  const dirty =
    editable &&
    parsedDraft != null &&
    Number.isFinite(parsedDraft) &&
    roundQty(parsedDraft, 2) !== roundQty(savedQty, 2)

  // Variance vs outgoing qty (what was ordered from this farmer), not total customer pre-orders.
  const expected = roundQty(assignment.outgoingQty ?? 0, 2)
  const qty = roundQty(displayQty, 2)
  let flag = null
  if (qty > expected) {
    flag = 'overdelivery'
  } else if (qty < expected) {
    flag = 'shortfall'
  }

  const unit = assignment.unit ?? UNIT_TYPES.KG
  const unitLabel = UNIT_TRANSLATION_KEYS[unit]
    ? t(UNIT_TRANSLATION_KEYS[unit])
    : unit

  const handleSubmit = (event) => {
    event.preventDefault()
    if (dirty && !saving) {
      onSave(assignment)
    }
  }

  const handleBlur = () => {
    if (dirty && !saving) {
      onSave(assignment)
    }
  }

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[--color-text-primary]">
            {localizedProductName(assignment, lang)}
          </p>
          <p className="text-xs text-[--color-text-secondary]">{assignment.farmerName}</p>
          <p className="mt-1 text-sm text-[--color-text-secondary]">
            {t('delivery.expected_qty_label')}:{' '}
            {formatQtyWithUnit(assignment.outgoingQty ?? 0, unit, t)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {editable ? (
            <form onSubmit={handleSubmit} className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={draftQty}
                  onChange={(e) => onDraftChange(assignment.assignmentId, e.target.value)}
                  onBlur={handleBlur}
                  disabled={saving}
                  className="w-24 min-h-[44px] rounded-lg border border-[--color-border] px-2 py-2 text-sm text-right disabled:opacity-50"
                />
                <span className="text-xs text-[--color-text-secondary]">{unitLabel}</span>
              </div>
              <button
                type="submit"
                disabled={!dirty || saving}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-text-inverse] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden />
                )}
                {t('action.save')}
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[--color-text-primary]">{savedQty}</span>
              <span className="text-xs text-[--color-text-secondary]">{unitLabel}</span>
            </div>
          )}
          {flag === 'shortfall' && (
            <span className="rounded-full bg-[--color-warning-light] px-2 py-0.5 text-xs font-medium text-[--color-warning]">
              {t('delivery.shortfall_flag')}
            </span>
          )}
          {flag === 'overdelivery' && (
            <span className="rounded-full bg-[--color-info-light] px-2 py-0.5 text-xs font-medium text-[--color-info]">
              {t('delivery.overdelivery_flag')}
            </span>
          )}
        </div>
      </div>
      {rowErrorKey && (
        <p className="mt-2 text-sm text-[--color-error]" role="alert">
          {t(rowErrorKey)}
        </p>
      )}
    </div>
  )
}

function PackingCustomerCard ({ customer, t, lang }) {
  const lineItems = (customer.orders ?? []).flatMap((order) =>
    (order.lineItems ?? []).map((li) => ({
      ...li,
      orderStatus: order.status,
    })),
  )

  const primaryStatus = (customer.orders ?? [])[0]?.status ?? 'confirmed'
  const statusClass =
    primaryStatus === 'packed'
      ? 'bg-[--color-info-light] text-[--color-info]'
      : 'bg-[--color-success-light] text-[--color-success]'
  const statusKey =
    primaryStatus === 'packed' ? 'order.status.packed' : 'order.status.confirmed'

  return (
    <div className="mb-3 rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[--color-text-primary]">{customer.customerName}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
          {t(statusKey)}
        </span>
      </div>
      {lineItems.length === 0 ? (
        <p className="text-sm text-[--color-text-secondary]">{t('delivery.packing_list_empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[--color-border] text-xs text-[--color-text-secondary]">
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
                    className="border-b border-[--color-border] last:border-0"
                  >
                    <td className="py-2 pr-2 text-[--color-text-primary]">
                      {localizedProductName(li, lang)}
                    </td>
                    <td className="py-2 pr-2 text-[--color-text-secondary]">{li.orderedQty}</td>
                    <td
                      className={`py-2 pr-2 ${
                        shortfall ? 'font-medium text-[--color-warning]' : 'text-[--color-text-secondary]'
                      }`}
                    >
                      {li.allocatedQty}
                    </td>
                    <td className="py-2 text-[--color-text-secondary]">
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

  const [assignmentRowsByProduct, setAssignmentRowsByProduct] = useState({})
  const [deliveredDrafts, setDeliveredDrafts] = useState({})
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
  const isReconciliationView = currentState === WEEK_STATES.RECONCILIATION
  const deliveredEditable = isDeliveryView || isReconciliationView

  const hasDeliveredData = assignments.length > 0
  const hasPackingData = packingCustomers.length > 0

  const showSubTabs =
    !isLockedView &&
    (isDeliveryView || hasDeliveredData || hasPackingData)

  const initializeFromDelivery = useCallback((items, assignmentList) => {
    const rows = {}
    for (const item of items) {
      rows[item.productId] = buildInitialAssignmentRows(assignmentList, item.productId)
    }
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
      apiGet('/api/v1/farmers?status=active'),
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

  useEffect(() => subscribeActiveWeekChanged(loadPage), [loadPage])

  const farmerNameById = useMemo(
    () => new Map(farmers.map((f) => [f.farmerId, f.name])),
    [farmers],
  )

  const farmerLocationById = useMemo(
    () => new Map(farmers.map((f) => [f.farmerId, f.location ?? ''])),
    [farmers],
  )

  const exportGroupedByFarmer = useMemo(() => {
    const groups = new Map()
    for (const item of produceItems) {
      const productId = item.productId
      const rows = assignmentRowsByProduct[productId] ?? []

      for (const row of rows) {
        if (!row.farmerId) continue
        const qty = Number(row.qty)
        if (!Number.isFinite(qty) || qty <= 0) continue

        if (!groups.has(row.farmerId)) {
          groups.set(row.farmerId, {
            farmerId: row.farmerId,
            farmerName: farmerNameById.get(row.farmerId) ?? row.farmerId,
            location: farmerLocationById.get(row.farmerId) ?? '',
            items: [],
          })
        }
        groups.get(row.farmerId).items.push({
          productId,
          nameEn: item.nameEn ?? productId,
          nameTa: item.nameTa ?? null,
          preorderQty: item.totalOrderedQty ?? 0,
          outgoingQty: qty,
          unit: item.unit ?? UNIT_TYPES.KG,
        })
      }
    }
    return [...groups.values()].sort((a, b) =>
      a.farmerName.localeCompare(b.farmerName),
    )
  }, [
    produceItems,
    assignmentRowsByProduct,
    farmerNameById,
    farmerLocationById,
  ])

  const assignableProduceItems = useMemo(
    () => produceItems.filter((item) =>
      shouldShowAssignmentCard(item, assignmentRowsByProduct[item.productId]),
    ),
    [produceItems, assignmentRowsByProduct],
  )

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
    const unit = item.unit ?? UNIT_TYPES.KG
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
        const rowOutgoing = parseQtyForUnit(row.qty, unit)
        if (rowOutgoing == null) {
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
            bufferQty: 0,
            assignedQty: rowOutgoing,
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
          productName: result.productName ?? item.nameEn ?? productId,
          nameEn: result.nameEn ?? item.nameEn ?? productId,
          nameTa: result.nameTa ?? item.nameTa ?? null,
          preorderQty: totalOrderedQty,
          bufferPct: null,
          bufferQty: 0,
          outgoingQty: result.outgoingQty ?? rowOutgoing,
          deliveredQty: result.deliveredQty ?? 0,
          unit,
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
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-full space-y-4 bg-[--color-background] px-4 pb-8 pt-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <StateMachineBadge state={currentState} />
        {marketDate && (
          <p className="text-right text-sm text-[--color-text-secondary]">
            {formatMarketDate(marketDate, lang)}
          </p>
        )}
      </header>

      {showReadOnlyNotice && (
        <p className="text-sm text-[--color-warning]">{t('delivery.read_only_notice')}</p>
      )}

      {loadErrorKey && (
        <div
          className="rounded-xl border border-[--color-error-light] bg-[--color-surface] p-4 text-sm text-[--color-error]"
          role="alert"
        >
          {t(loadErrorKey)}
        </div>
      )}

      {!loadErrorKey && !weekId && (
        <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 text-sm text-[--color-text-secondary]">
          {t('error.week_not_found')}
        </div>
      )}

      {weekId && !loadErrorKey && (
        <>
          {isLockedView && (
            <div className="space-y-4">
              {assignableProduceItems.length === 0 ? (
                <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 text-sm text-[--color-text-secondary]">
                  {t('empty.produce_list')}
                </div>
              ) : (
                assignableProduceItems.map((item) => (
                  <AssignmentCard
                    key={item.productId}
                    item={item}
                    productName={localizedProductName(item, lang)}
                    unit={item.unit ?? UNIT_TYPES.KG}
                    assignmentRows={
                      assignmentRowsByProduct[item.productId] ??
                      buildInitialAssignmentRows(assignments, item.productId)
                    }
                    farmers={farmers}
                    saving={savingProductId === item.productId}
                    cardErrorKey={cardErrors[item.productId]}
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
                ))
              )}
              <FarmerOrderSummaryGrid
                groupedByFarmer={exportGroupedByFarmer}
                farmers={farmers}
                lang={lang}
                marketDate={marketDate}
                t={t}
              />
            </div>
          )}

          {showSubTabs && (
            <>
              <div className="flex gap-1 rounded-xl border border-[--color-border] bg-[--color-surface] p-1">
                <button
                  type="button"
                  onClick={() => setSubTab('delivered')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    subTab === 'delivered'
                      ? 'bg-[--color-primary] text-[--color-text-inverse]'
                      : 'text-[--color-text-secondary]'
                  }`}
                >
                  {t('delivery.tab_delivered_quantities')}
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('packing')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    subTab === 'packing'
                      ? 'bg-[--color-primary] text-[--color-text-inverse]'
                      : 'text-[--color-text-secondary]'
                  }`}
                >
                  {t('delivery.tab_packing_list')}
                </button>
              </div>

              {subTab === 'delivered' && (
                <div>
                  {!deliveredEditable && (
                    <p className="mb-3 rounded-lg border border-[--color-warning-light] bg-[--color-surface] px-3 py-2 text-sm text-[--color-warning]">
                      {t('delivery.not_available_in_state')}
                    </p>
                  )}
                  {assignments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-[--color-border] bg-[--color-surface] py-16">
                      <Package size={32} strokeWidth={1.5} className="text-[--color-text-disabled]" />
                      <p className="mt-3 text-sm text-[--color-text-secondary]">
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
                        lang={lang}
                      />
                    ))
                  )}
                </div>
              )}

              {subTab === 'packing' && (
                <div>
                  {packingCustomers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-[--color-border] bg-[--color-surface] py-16">
                      <Package size={32} strokeWidth={1.5} className="text-[--color-text-disabled]" />
                      <p className="mt-3 text-sm text-[--color-text-secondary]">
                        {t('delivery.packing_list_empty')}
                      </p>
                    </div>
                  ) : (
                    packingCustomers.map((customer) => (
                      <PackingCustomerCard
                        key={customer.customerId}
                        customer={customer}
                        t={t}
                        lang={lang}
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
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[--color-border] bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-[--color-text-primary]">
            {toast.message
              ?? translateWithFallback(t, toast.key, toast.fallbackKey)}
          </p>
        </div>
      )}

    </div>
  )
}
