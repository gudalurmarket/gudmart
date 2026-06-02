import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import LoadingSpinner from '../../shared/components/LoadingSpinner.jsx'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { TransitionGateBlockedError, apiGet, apiPatch, apiPost } from '../../shared/lib/api.js'
import { apiErrorTranslationKey } from '../../shared/lib/apiErrors.js'
import { formatMarketDate, pickActiveWeek } from '../../shared/lib/activeWeek.js'
import { PAYMENT_CHANNELS, UNIT_TYPES, WEEK_STATES } from '../../shared/lib/constants.js'
import { formatINROptional, paiseToRupees, parseINR, rupeesToPaise } from '../../shared/lib/paise.js'

const TOAST_DISMISS_MS = 4000
const FCFS_TOAST_DISMISS_MS = 6000

const UNIT_TRANSLATION_KEYS = {
  [UNIT_TYPES.KG]: 'unit.kg',
  [UNIT_TYPES.PIECE]: 'unit.piece',
  [UNIT_TYPES.BUNCH]: 'unit.bunch',
  [UNIT_TYPES.GRAMS]: 'unit.100g',
}

const TABS = [
  { id: 'priceDiff', labelKey: 'reconciliation.tab_price_differences' },
  { id: 'outstationPayments', labelKey: 'reconciliation.tab_outstation_payments' },
  { id: 'localPayments', labelKey: 'reconciliation.tab_local_payments' },
  { id: 'deliveryEdit', labelKey: 'reconciliation.tab_delivery_edit' },
]

const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid']

const BLOCKER_TAB_MAP = {
  UNCONFIRMED_PRICE_DIFF: 'priceDiff',
  OUTSTATION_PAYMENT_INCOMPLETE: 'outstationPayments',
  LOCAL_FARMER_PAYMENT_INCOMPLETE: 'localPayments',
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function unitStr(unit, t) {
  const key = UNIT_TRANSLATION_KEYS[unit]
  return key ? t(key) : (unit ?? '')
}

function groupLocalFarmerItems(items) {
  const map = new Map()
  for (const item of items) {
    if (!map.has(item.farmerId)) {
      map.set(item.farmerId, {
        farmerId: item.farmerId,
        farmerName: item.farmerName,
        paymentId: item.paymentId ?? null,
        items: [],
      })
    }
    map.get(item.farmerId).items.push(item)
  }
  return [...map.values()]
}

function initSoldQtyDrafts(farmerGroups) {
  const drafts = {}
  for (const group of farmerGroups) {
    for (let idx = 0; idx < group.items.length; idx++) {
      drafts[`${group.farmerId}_${idx}`] = String(group.items[idx].soldQty ?? 0)
    }
  }
  return drafts
}

function computeLocalTotalDue(farmerGroup, soldQtyDrafts) {
  return farmerGroup.items.reduce((sum, item, idx) => {
    const qty = Number(soldQtyDrafts[`${farmerGroup.farmerId}_${idx}`] ?? item.soldQty ?? 0)
    return sum + Math.floor(qty * (item.pricePerUnit ?? 0))
  }, 0)
}

// ── StatPill ──────────────────────────────────────────────────────────────────

function StatPill({ count, total, labelKey, amber, t }) {
  const colorClass = amber
    ? 'bg-[--color-warning-light] text-[--color-warning]'
    : 'bg-[--color-success-light] text-[--color-success]'
  const display = total != null ? `${count}/${total}` : String(count)
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}>
      <span className="font-semibold">{display}</span>
      <span>{t(labelKey)}</span>
    </div>
  )
}

// ── DifferenceCard ────────────────────────────────────────────────────────────

function DifferenceCard({ diff, isReconciliation, confirming, errorKey, onConfirm, t }) {
  const diffQty = diff.differenceQty ?? 0
  const isShortfall = diffQty < 0
  const isOverdelivery = diffQty > 0
  const sign = diffQty > 0 ? '+' : ''
  const unit = unitStr(diff.unit, t)
  const absMonetary = Math.abs(diff.monetaryDifference ?? 0)

  return (
    <div className="mb-3 rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      {/* Row 1 — customer + product + type badge */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[--color-text-primary]">{diff.customerName}</p>
          <p className="text-xs text-[--color-text-secondary]">{diff.productName ?? diff.productId}</p>
        </div>
        {isShortfall && (
          <span className="rounded-full bg-[--color-warning-light] px-2.5 py-0.5 text-xs font-medium text-[--color-warning]">
            {t('reconciliation.shortfall_label')}
          </span>
        )}
        {isOverdelivery && (
          <span className="rounded-full bg-[--color-info-light] px-2.5 py-0.5 text-xs font-medium text-[--color-info]">
            {t('reconciliation.overdelivery_label')}
          </span>
        )}
      </div>

      {/* Row 2 — qty detail */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[--color-text-secondary]">
        <span>{t('reconciliation.ordered_label')}: {diff.orderedQty ?? 0} {unit}</span>
        <span>{t('reconciliation.delivered_label')}: {diff.deliveredQty ?? 0} {unit}</span>
        <span className={isShortfall ? 'text-[--color-warning]' : isOverdelivery ? 'text-[--color-info]' : 'text-[--color-text-secondary]'}>
          {t('reconciliation.diff_label')}: {sign}{diffQty} {unit}
        </span>
      </div>

      {/* Row 3 — monetary */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-[--color-text-secondary]">
          {formatINROptional(diff.pricePerUnit ?? 0)}{t('reconciliation.per_unit_suffix')}
        </span>
        <span className={`font-medium ${isShortfall ? 'text-[--color-warning]' : 'text-[--color-error]'}`}>
          {isShortfall ? t('reconciliation.credit_label') : t('reconciliation.debit_label')}
          {': '}
          {formatINROptional(absMonetary)}
        </span>
      </div>

      {/* Confirmed / confirm button */}
      {diff.differenceConfirmed ? (
        <div className="mt-3 flex items-center gap-1.5 text-sm text-[--color-success]">
          <CheckCircle size={16} strokeWidth={1.5} />
          <span>{t('reconciliation.difference_confirmed')}</span>
        </div>
      ) : isReconciliation ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onConfirm(diff.diffId ?? diff._id)}
            disabled={confirming}
            className="inline-flex items-center gap-2 rounded-xl bg-[--color-primary] px-4 py-2 text-sm text-[--color-text-inverse] disabled:opacity-60"
          >
            {confirming && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
            {t('reconciliation.confirm_difference_button')}
          </button>
        </div>
      ) : null}

      {errorKey && (
        <p className="mt-2 text-sm text-[--color-error]" role="alert">
          {t(errorKey)}
        </p>
      )}
    </div>
  )
}

// ── FarmerPaymentCard ─────────────────────────────────────────────────────────

function FarmerPaymentCard({
  payment,
  isReconciliation,
  isOpen,
  formState,
  saving,
  errorKey,
  onToggle,
  onFormChange,
  onSave,
  t,
}) {
  const outstanding = Math.max(0, (payment.amountDue ?? 0) - (payment.amountPaid ?? 0))
  const showAmounts = payment.status === 'partial' || payment.status === 'paid'

  const statusBadgeClass = {
    unpaid: 'bg-[--color-error-light] text-[--color-error]',
    partial: 'bg-[--color-warning-light] text-[--color-warning]',
    paid: 'bg-[--color-success-light] text-[--color-success]',
  }[payment.status] ?? 'bg-[--color-surface-raised] text-[--color-text-secondary]'

  const toggleLabelKey =
    payment.status === 'paid'
      ? 'reconciliation.edit_payment_button'
      : 'reconciliation.record_payment_button'

  const form = formState ?? {
    status: payment.status,
    amountInput: '',
    channel: PAYMENT_CHANNELS.CASH,
  }

  return (
    <div className="mb-3 rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[--color-text-primary]">{payment.farmerName}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
          {t(`payment.status.${payment.status}`)}
        </span>
      </div>

      {/* Amounts */}
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[--color-text-secondary]">{t('reconciliation.amount_due_label')}</span>
          <span className="font-medium text-[--color-text-primary]">{formatINROptional(payment.amountDue ?? 0)}</span>
        </div>
        {showAmounts && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[--color-text-secondary]">{t('reconciliation.amount_paid_label')}</span>
              <span className="font-medium text-[--color-text-primary]">{formatINROptional(payment.amountPaid ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[--color-text-secondary]">{t('reconciliation.outstanding_label')}</span>
              <span className={`font-medium ${outstanding > 0 ? 'text-[--color-error]' : 'text-[--color-success]'}`}>
                {formatINROptional(outstanding)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Toggle payment form */}
      {isReconciliation && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[--color-primary]"
        >
          {isOpen
            ? <ChevronUp size={16} strokeWidth={1.5} />
            : <ChevronDown size={16} strokeWidth={1.5} />}
          {t(toggleLabelKey)}
        </button>
      )}

      {/* Payment form */}
      {isOpen && (
        <div className="mt-3 space-y-3 border-t border-[--color-border] pt-3">
          {/* Status pills */}
          <div className="flex gap-2">
            {PAYMENT_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => onFormChange('status', st)}
                className={`flex-1 rounded-full px-2 py-1.5 text-sm font-medium transition-colors ${
                  form.status === st
                    ? 'bg-[--color-primary] text-[--color-text-inverse]'
                    : 'border border-[--color-border] text-[--color-text-secondary]'
                }`}
              >
                {t(`payment.status.${st}`)}
              </button>
            ))}
          </div>

          {/* Amount + channel (partial or paid) */}
          {(form.status === 'partial' || form.status === 'paid') && (
            <>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={form.amountInput}
                onChange={(e) => onFormChange('amountInput', e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                {[PAYMENT_CHANNELS.CASH, PAYMENT_CHANNELS.UPI].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => onFormChange('channel', ch)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      form.channel === ch
                        ? 'bg-[--color-primary] text-[--color-text-inverse]'
                        : 'border border-[--color-border] text-[--color-text-secondary]'
                    }`}
                  >
                    {t(ch === PAYMENT_CHANNELS.CASH ? 'payment.channel.cash' : 'payment.channel.upi')}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[--color-primary] px-4 py-2 text-sm text-[--color-text-inverse] disabled:opacity-60"
          >
            {saving && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
            {t('action.save')}
          </button>
        </div>
      )}

      {errorKey && (
        <p className="mt-2 text-sm text-[--color-error]" role="alert">
          {t(errorKey)}
        </p>
      )}
    </div>
  )
}

// ── LocalFarmerPaymentCard ────────────────────────────────────────────────────

function LocalFarmerPaymentCard({
  farmerGroup,
  isReconciliation,
  isPaid,
  soldQtyDrafts,
  totalDuePaise,
  formState,
  saving,
  errorKey,
  onSoldQtyChange,
  onFormChange,
  onSave,
  t,
}) {
  const canEditSoldQty = isReconciliation && !isPaid
  const statusClass = isPaid ? 'bg-[--color-success-light] text-[--color-success]' : 'bg-[--color-error-light] text-[--color-error]'
  const form = formState ?? { amountInput: String(paiseToRupees(Math.max(0, totalDuePaise))), channel: PAYMENT_CHANNELS.CASH }

  return (
    <div className="mb-3 rounded-xl border border-[--color-border] bg-[--color-surface] p-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[--color-text-primary]">{farmerGroup.farmerName}</p>
          <p className="mt-0.5 text-sm text-[--color-text-secondary]">
            {t('reconciliation.amount_due_label')}: {formatINROptional(totalDuePaise)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
          {t(isPaid ? 'payment.status.paid' : 'payment.status.unpaid')}
        </span>
      </div>

      {/* Items table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[--color-border] text-xs text-[--color-text-secondary]">
              <th className="pb-2 pr-3 font-medium">{t('market_day.item_label')}</th>
              <th className="pb-2 pr-3 font-medium">{t('market_day.inbound_qty_label')}</th>
              <th className="pb-2 pr-3 font-medium">{t('reconciliation.sold_qty_label')}</th>
              <th className="pb-2 pr-3 font-medium">{t('reconciliation.unsold_qty_label')}</th>
              <th className="pb-2 pr-3 font-medium">{t('field.unit')}</th>
              <th className="pb-2 text-right font-medium">{t('summary.total_label')}</th>
            </tr>
          </thead>
          <tbody>
            {farmerGroup.items.map((item, idx) => {
              const draftKey = `${farmerGroup.farmerId}_${idx}`
              const soldQtyStr = soldQtyDrafts[draftKey] ?? String(item.soldQty ?? 0)
              const soldQty = Math.max(0, Number(soldQtyStr) || 0)
              const unsoldQty = Math.max(0, (item.inboundQty ?? 0) - soldQty)
              const lineValue = Math.floor(soldQty * (item.pricePerUnit ?? 0))

              return (
                <tr key={draftKey} className="border-b border-[--color-border] last:border-0">
                  <td className="py-2 pr-3 text-[--color-text-primary]">{item.itemName}</td>
                  <td className="py-2 pr-3 text-[--color-text-secondary]">{item.inboundQty ?? 0}</td>
                  <td className="py-2 pr-3">
                    {canEditSoldQty ? (
                      <input
                        type="number"
                        min={0}
                        max={item.inboundQty ?? undefined}
                        step={1}
                        value={soldQtyStr}
                        onChange={(e) => onSoldQtyChange(draftKey, e.target.value)}
                        className="w-20 min-h-[44px] rounded-lg border border-[--color-border] px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-[--color-text-secondary]">{soldQty}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-[--color-text-secondary]">{unsoldQty}</td>
                  <td className="py-2 pr-3 text-[--color-text-secondary]">{unitStr(item.unit, t)}</td>
                  <td className="py-2 text-right text-[--color-text-secondary]">{formatINROptional(lineValue)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Payment form — state-gated, not yet paid */}
      {isReconciliation && !isPaid && (
        <div className="mt-4 space-y-3 border-t border-[--color-border] pt-3">
          <div>
            <label className="mb-1 block text-xs text-[--color-text-secondary]">
              {t('reconciliation.amount_due_label')} (₹)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.amountInput}
              onChange={(e) => onFormChange('amountInput', e.target.value)}
              className="w-full rounded-lg border border-[--color-border] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {[PAYMENT_CHANNELS.CASH, PAYMENT_CHANNELS.UPI].map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => onFormChange('channel', ch)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  form.channel === ch
                    ? 'bg-[--color-primary] text-[--color-text-inverse]'
                    : 'border border-[--color-border] text-[--color-text-secondary]'
                }`}
              >
                {t(ch === PAYMENT_CHANNELS.CASH ? 'payment.channel.cash' : 'payment.channel.upi')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[--color-primary] px-4 py-2 text-sm text-[--color-text-inverse] disabled:opacity-60"
          >
            {saving && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
            {t('reconciliation.record_local_farmer_payment_button')}
          </button>
        </div>
      )}

      {errorKey && (
        <p className="mt-2 text-sm text-[--color-error]" role="alert">
          {t(errorKey)}
        </p>
      )}
    </div>
  )
}

// ── DeliveryEditRow ───────────────────────────────────────────────────────────

function DeliveryEditRow({ assignment, editable, draftQty, saving, rowErrorKey, onDraftChange, onSave, t }) {
  const savedQty = assignment.deliveredQty ?? 0
  const parsedDraft = draftQty === '' ? null : Number(draftQty)
  const dirty =
    editable &&
    parsedDraft != null &&
    Number.isFinite(parsedDraft) &&
    parsedDraft !== savedQty
  const unit = assignment.unit ?? UNIT_TYPES.KG

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[--color-text-primary]">{assignment.productName}</p>
          <p className="text-xs text-[--color-text-secondary]">{assignment.farmerName}</p>
          <p className="mt-1 text-sm text-[--color-text-secondary]">
            {t('delivery.expected_qty_label')}: {assignment.outgoingQty ?? 0} {unitStr(unit, t)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable ? (
            <input
              type="number"
              min={0}
              step={0.1}
              value={draftQty}
              onChange={(e) => onDraftChange(assignment.assignmentId, e.target.value)}
              className="w-24 min-h-[44px] rounded-lg border border-[--color-border] px-2 py-2 text-sm text-right"
            />
          ) : (
            <span className="text-sm font-medium text-[--color-text-primary]">{savedQty}</span>
          )}
          <span className="text-xs text-[--color-text-secondary]">{unitStr(unit, t)}</span>
          {dirty && (
            <button
              type="button"
              onClick={() => onSave(assignment)}
              disabled={saving}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[--color-primary] text-sm font-medium text-[--color-primary] disabled:opacity-50"
            >
              {saving
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                : t('action.save')}
            </button>
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

// ── Reconciliation (main page) ────────────────────────────────────────────────

export default function Reconciliation() {
  const { t, lang } = useLang()

  // ── Core data ─────────────────────────────────────────────────────────────
  const [weekId, setWeekId] = useState(null)
  const [currentState, setCurrentState] = useState(null)
  const [marketDate, setMarketDate] = useState(null)
  const [priceDifferences, setPriceDifferences] = useState([])
  const [localFarmerItems, setLocalFarmerItems] = useState([])
  const [payments, setPayments] = useState([])
  const [assignments, setAssignments] = useState([])

  // ── UI ────────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [loadErrorKey, setLoadErrorKey] = useState(null)
  const [activeTab, setActiveTab] = useState('priceDiff')
  const [toast, setToast] = useState(null)
  const [toastDuration, setToastDuration] = useState(TOAST_DISMISS_MS)

  // ── Tab A state ───────────────────────────────────────────────────────────
  const [confirmedSectionOpen, setConfirmedSectionOpen] = useState(false)
  const [confirmingDiffId, setConfirmingDiffId] = useState(null)
  const [diffErrors, setDiffErrors] = useState({})

  // ── Tab B state ───────────────────────────────────────────────────────────
  const [openPaymentFormId, setOpenPaymentFormId] = useState(null)
  const [paymentForms, setPaymentForms] = useState({})
  const [savingPaymentId, setSavingPaymentId] = useState(null)
  const [paymentErrors, setPaymentErrors] = useState({})

  // ── Tab C state ───────────────────────────────────────────────────────────
  const [soldQtyDrafts, setSoldQtyDrafts] = useState({})
  const [localPaymentForms, setLocalPaymentForms] = useState({})
  const [savingLocalFarmerId, setSavingLocalFarmerId] = useState(null)
  const [localFarmerErrors, setLocalFarmerErrors] = useState({})
  const [localFarmerPaidState, setLocalFarmerPaidState] = useState({})

  // ── Tab D state ───────────────────────────────────────────────────────────
  const [deliveredDrafts, setDeliveredDrafts] = useState({})
  const [savingAssignmentId, setSavingAssignmentId] = useState(null)
  const [deliveryRowErrors, setDeliveryRowErrors] = useState({})

  // ── Close Week state ──────────────────────────────────────────────────────
  const [closeWeekConfirm, setCloseWeekConfirm] = useState(false)
  const [closingWeek, setClosingWeek] = useState(false)
  const [closeBlockers, setCloseBlockers] = useState(null)
  const [closeWeekError, setCloseWeekError] = useState(null)

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), toastDuration)
    return () => clearTimeout(timer)
  }, [toast, toastDuration])

  const showToast = useCallback((key, duration = TOAST_DISMISS_MS) => {
    setToastDuration(duration)
    setToast({ key })
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  const localFarmerGroups = useMemo(
    () => groupLocalFarmerItems(localFarmerItems),
    [localFarmerItems],
  )

  const isReconciliation = currentState === WEEK_STATES.RECONCILIATION

  const correctionWindowOpen = useMemo(
    () => isReconciliation && priceDifferences.every((d) => !d.differenceConfirmed),
    [isReconciliation, priceDifferences],
  )

  const unconfirmedDiffCount = priceDifferences.filter((d) => !d.differenceConfirmed).length
  const farmersUnpaidCount = payments.filter((p) => p.status !== 'paid').length
  const localFarmersUnpaidCount = localFarmerGroups.filter(
    (g) => !localFarmerPaidState[g.farmerId],
  ).length

  // ── Data loading ──────────────────────────────────────────────────────────
  const applyReconData = useCallback((data) => {
    setPriceDifferences(data.priceDifferences ?? [])
    setLocalFarmerItems(data.localFarmerItems ?? [])
  }, [])

  const loadWeekData = useCallback(
    async (wid) => {
      const [reconData, paymentsData, deliveryData] = await Promise.all([
        apiGet(`/api/v1/weeks/${wid}/reconciliation`),
        apiGet(`/api/v1/weeks/${wid}/farmerpayments`),
        apiGet(`/api/v1/weeks/${wid}/delivery`),
      ])

      const diffs = reconData.priceDifferences ?? []
      const lfItems = reconData.localFarmerItems ?? []
      setPriceDifferences(diffs)
      setLocalFarmerItems(lfItems)

      setPayments(paymentsData.payments ?? [])

      const asgns = deliveryData.assignments ?? []
      setAssignments(asgns)
      const drafts = {}
      for (const a of asgns) {
        drafts[a.assignmentId] = String(a.deliveredQty ?? 0)
      }
      setDeliveredDrafts(drafts)

      const groups = groupLocalFarmerItems(lfItems)
      setSoldQtyDrafts(initSoldQtyDrafts(groups))
    },
    [],
  )

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
        setPriceDifferences([])
        setLocalFarmerItems([])
        setPayments([])
        setAssignments([])
        return
      }
      const id = active.weekId ?? active.week_id ?? active._id
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

  // ── Tab A handlers ────────────────────────────────────────────────────────
  const handleConfirmDiff = useCallback(
    async (diffId) => {
      setConfirmingDiffId(diffId)
      setDiffErrors((prev) => ({ ...prev, [diffId]: null }))
      try {
        const result = await apiPost(
          `/api/v1/weeks/${weekId}/reconciliation/${diffId}/confirm`,
          {},
        )
        setPriceDifferences((prev) =>
          prev.map((d) =>
            (d.diffId ?? d._id) === diffId ? { ...d, differenceConfirmed: true } : d,
          ),
        )
        showToast(
          result.customerDueCreated ? 'toast.customer_due_created' : 'toast.price_difference_confirmed',
        )
      } catch (err) {
        setDiffErrors((prev) => ({ ...prev, [diffId]: apiErrorTranslationKey(err) }))
      } finally {
        setConfirmingDiffId(null)
      }
    },
    [weekId, showToast],
  )

  // ── Tab B handlers ────────────────────────────────────────────────────────
  const handleTogglePaymentForm = useCallback(
    (payment) => {
      const id = payment.paymentId ?? payment._id
      if (openPaymentFormId === id) {
        setOpenPaymentFormId(null)
        return
      }
      setOpenPaymentFormId(id)
      setPaymentForms((prev) => {
        if (prev[id]) return prev
        return {
          ...prev,
          [id]: {
            status: payment.status,
            amountInput: payment.amountPaid
              ? String(paiseToRupees(payment.amountPaid))
              : '',
            channel: payment.channel ?? PAYMENT_CHANNELS.CASH,
          },
        }
      })
    },
    [openPaymentFormId],
  )

  const handlePaymentFormChange = useCallback((paymentId, field, value, payment) => {
    setPaymentForms((prev) => {
      const current = prev[paymentId] ?? {}
      const updates = { [field]: value }
      if (field === 'status' && value === 'paid' && payment) {
        updates.amountInput = String(paiseToRupees(payment.amountDue ?? 0))
      }
      if (field === 'status' && value === 'unpaid') {
        updates.amountInput = ''
      }
      return { ...prev, [paymentId]: { ...current, ...updates } }
    })
  }, [])

  const handleSavePayment = useCallback(
    async (payment) => {
      const id = payment.paymentId ?? payment._id
      const form = paymentForms[id]
      if (!form) return

      let amountPaidPaise
      if (form.status === 'unpaid') {
        amountPaidPaise = 0
      } else {
        amountPaidPaise = rupeesToPaise(Number(form.amountInput))
        if (!Number.isFinite(amountPaidPaise) || amountPaidPaise <= 0) {
          setPaymentErrors((prev) => ({ ...prev, [id]: 'error.validation' }))
          return
        }
      }

      setSavingPaymentId(id)
      setPaymentErrors((prev) => ({ ...prev, [id]: null }))
      try {
        const updated = await apiPatch(`/api/v1/weeks/${weekId}/farmerpayments/${id}`, {
          status: form.status,
          amountPaid: amountPaidPaise,
          channel: form.status === 'unpaid' ? null : (form.channel ?? null),
        })
        setPayments((prev) =>
          prev.map((p) => (p.paymentId ?? p._id) === id ? updated : p),
        )
        setOpenPaymentFormId(null)
        showToast('toast.farmer_payment_saved')
      } catch (err) {
        setPaymentErrors((prev) => ({ ...prev, [id]: apiErrorTranslationKey(err) }))
      } finally {
        setSavingPaymentId(null)
      }
    },
    [weekId, paymentForms, showToast],
  )

  // ── Tab C handlers ────────────────────────────────────────────────────────
  const handleSoldQtyChange = useCallback((draftKey, value) => {
    setSoldQtyDrafts((prev) => ({ ...prev, [draftKey]: value }))
  }, [])

  const handleLocalPaymentFormChange = useCallback((farmerId, field, value) => {
    setLocalPaymentForms((prev) => ({
      ...prev,
      [farmerId]: { ...(prev[farmerId] ?? {}), [field]: value },
    }))
  }, [])

  const getLocalFormState = useCallback(
    (farmerId, totalDuePaise) => {
      if (localPaymentForms[farmerId]) return localPaymentForms[farmerId]
      return {
        amountInput: String(paiseToRupees(Math.max(0, totalDuePaise))),
        channel: PAYMENT_CHANNELS.CASH,
      }
    },
    [localPaymentForms],
  )

  const handleSaveLocalPayment = useCallback(
    async (farmerGroup, formState) => {
      const amountPaidPaise = parseINR(formState.amountInput) ?? 0
      if (amountPaidPaise <= 0) {
        setLocalFarmerErrors((prev) => ({
          ...prev,
          [farmerGroup.farmerId]: 'error.validation',
        }))
        return
      }

      const isCash = formState.channel === PAYMENT_CHANNELS.CASH
      const items = farmerGroup.items
      const totalDue = items.reduce((s, it) => s + (it.amountDue ?? 0), 0)

      // Distribute total amount proportionally across each inbound item.
      // The gate validator checks payment_amount_cash + payment_amount_bank > 0
      // on every LocalFarmerInbound row, so each item must receive at least 1 paise.
      let remaining = amountPaidPaise
      const shares = items.map((item, idx) => {
        if (idx === items.length - 1) return Math.max(1, remaining)
        const fraction = totalDue > 0 ? (item.amountDue ?? 0) / totalDue : 1 / items.length
        const share = Math.max(1, Math.round(amountPaidPaise * fraction))
        remaining -= share
        return share
      })

      setSavingLocalFarmerId(farmerGroup.farmerId)
      setLocalFarmerErrors((prev) => ({ ...prev, [farmerGroup.farmerId]: null }))
      try {
        const results = await Promise.all(
          items.map((item, idx) =>
            apiPatch(
              `/api/v1/weeks/${weekId}/localfarmer-inbound/${item.inboundId}/payment`,
              {
                paymentAmountCash: isCash ? shares[idx] : 0,
                paymentAmountBank: isCash ? 0 : shares[idx],
              },
            ),
          ),
        )
        setLocalFarmerItems((prev) => {
          const next = [...prev]
          for (const result of results) {
            const idx = next.findIndex((it) => it.inboundId === result.inboundId)
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                soldQty: result.soldQty,
                paymentAmountCash: result.paymentAmountCash,
                paymentAmountBank: result.paymentAmountBank,
              }
            }
          }
          return next
        })
        setLocalFarmerPaidState((prev) => ({ ...prev, [farmerGroup.farmerId]: true }))
        showToast('toast.local_farmer_payment_saved')
      } catch (err) {
        setLocalFarmerErrors((prev) => ({
          ...prev,
          [farmerGroup.farmerId]: apiErrorTranslationKey(err),
        }))
      } finally {
        setSavingLocalFarmerId(null)
      }
    },
    [weekId, showToast],
  )

  // ── Tab D handlers ────────────────────────────────────────────────────────
  const handleDeliveredDraftChange = useCallback((assignmentId, value) => {
    setDeliveredDrafts((prev) => ({ ...prev, [assignmentId]: value }))
  }, [])

  const handleSaveDeliveredQty = useCallback(
    async (assignment) => {
      const draft = deliveredDrafts[assignment.assignmentId]
      const deliveredQty = Number(draft)
      if (!Number.isFinite(deliveredQty) || deliveredQty < 0) {
        setDeliveryRowErrors((prev) => ({
          ...prev,
          [assignment.assignmentId]: 'error.validation',
        }))
        return
      }

      setSavingAssignmentId(assignment.assignmentId)
      setDeliveryRowErrors((prev) => ({ ...prev, [assignment.assignmentId]: null }))
      try {
        const result = await apiPatch(
          `/api/v1/weeks/${weekId}/delivery/${assignment.assignmentId}`,
          { deliveredQty, overrideVolunteer: true },
        )
        setAssignments((prev) =>
          prev.map((a) =>
            a.assignmentId === assignment.assignmentId
              ? { ...a, deliveredQty: result.deliveredQty ?? deliveredQty }
              : a,
          ),
        )
        setDeliveredDrafts((prev) => ({
          ...prev,
          [assignment.assignmentId]: String(result.deliveredQty ?? deliveredQty),
        }))

        // Reload price differences — delivered qty change recalculates them
        const reconData = await apiGet(`/api/v1/weeks/${weekId}/reconciliation`)
        applyReconData(reconData)

        if (result.fcfsTriggered) {
          showToast('toast.fcfs_reallocated', FCFS_TOAST_DISMISS_MS)
        } else {
          showToast('toast.delivered_qty_updated')
        }
      } catch (err) {
        setDeliveryRowErrors((prev) => ({
          ...prev,
          [assignment.assignmentId]: apiErrorTranslationKey(err),
        }))
      } finally {
        setSavingAssignmentId(null)
      }
    },
    [weekId, deliveredDrafts, applyReconData, showToast],
  )

  // ── Close Week handler ────────────────────────────────────────────────────
  const handleCloseWeek = useCallback(async () => {
    setClosingWeek(true)
    setCloseBlockers(null)
    setCloseWeekError(null)
    try {
      await apiPatch(`/api/v1/weeks/${weekId}/state`, { targetState: 'closed' })
      setCurrentState('closed')
      setCloseWeekConfirm(false)
      showToast('toast.week_closed')
    } catch (err) {
      setCloseWeekConfirm(false)
      if (err instanceof TransitionGateBlockedError) {
        setCloseBlockers(err.blockers ?? [])
      } else {
        setCloseWeekError(apiErrorTranslationKey(err))
      }
    } finally {
      setClosingWeek(false)
    }
  }, [weekId, showToast])

  // ── Render: loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const unconfirmedDiffs = priceDifferences.filter((d) => !d.differenceConfirmed)
  const confirmedDiffs = priceDifferences.filter((d) => d.differenceConfirmed)

  return (
    <div className="min-h-full space-y-4 bg-[--color-background] px-4 pb-8 pt-4">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <StateMachineBadge state={currentState} />
        {marketDate && (
          <p className="text-right text-sm text-[--color-text-secondary]">
            {formatMarketDate(marketDate, lang)}
          </p>
        )}
      </header>

      {currentState != null && !isReconciliation && (
        <p className="text-sm text-[--color-warning]">{t('reconciliation.read_only_notice')}</p>
      )}

      {/* Progress summary — reconciliation state only */}
      {isReconciliation && (
        <div className="flex flex-wrap gap-2">
          <StatPill
            count={unconfirmedDiffCount}
            labelKey="reconciliation.unconfirmed_count"
            amber={unconfirmedDiffCount > 0}
            t={t}
          />
          <StatPill
            count={farmersUnpaidCount}
            total={payments.length}
            labelKey="reconciliation.farmers_unpaid_count"
            amber={farmersUnpaidCount > 0}
            t={t}
          />
          <StatPill
            count={localFarmersUnpaidCount}
            total={localFarmerGroups.length}
            labelKey="reconciliation.local_farmers_unpaid_count"
            amber={localFarmersUnpaidCount > 0}
            t={t}
          />
        </div>
      )}

      {/* Load error */}
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
          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-[--color-border] bg-[--color-surface] p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[--color-primary] text-[--color-text-inverse]'
                    : 'text-[--color-text-secondary] hover:text-[--color-text-primary]'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          {/* ── Tab A — Price Differences ─────────────────────────────────── */}
          {activeTab === 'priceDiff' && (
            <div>
              {priceDifferences.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[--color-border] bg-[--color-surface] py-16">
                  <CheckCircle size={32} strokeWidth={1.5} className="text-[--color-success]" />
                  <p className="mt-3 text-sm text-[--color-text-secondary]">
                    {t('reconciliation.no_differences')}
                  </p>
                </div>
              ) : (
                <>
                  {/* Unconfirmed differences */}
                  {unconfirmedDiffs.map((diff) => (
                    <DifferenceCard
                      key={diff.diffId ?? diff._id}
                      diff={diff}
                      isReconciliation={isReconciliation}
                      confirming={confirmingDiffId === (diff.diffId ?? diff._id)}
                      errorKey={diffErrors[diff.diffId ?? diff._id] ?? null}
                      onConfirm={handleConfirmDiff}
                      t={t}
                    />
                  ))}

                  {/* Confirmed section — collapsed by default */}
                  {confirmedDiffs.length > 0 && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmedSectionOpen((v) => !v)}
                        className="flex w-full items-center justify-between rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3 text-sm font-medium text-[--color-text-secondary]"
                      >
                        <span>
                          {t('reconciliation.confirmed_section_header')} ({confirmedDiffs.length})
                        </span>
                        {confirmedSectionOpen
                          ? <ChevronUp size={16} strokeWidth={1.5} />
                          : <ChevronDown size={16} strokeWidth={1.5} />}
                      </button>
                      {confirmedSectionOpen && (
                        <div className="mt-2">
                          {confirmedDiffs.map((diff) => (
                            <DifferenceCard
                              key={diff.diffId ?? diff._id}
                              diff={diff}
                              isReconciliation={false}
                              confirming={false}
                              errorKey={null}
                              onConfirm={() => {}}
                              t={t}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Tab B — Outstation Farmer Payments ───────────────────────── */}
          {activeTab === 'outstationPayments' && (
            <div>
              {payments.length === 0 ? (
                <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 text-sm text-[--color-text-secondary]">
                  {t('empty.farmer_list')}
                </div>
              ) : (
                [...payments]
                  .sort((a, b) => (a.farmerName ?? '').localeCompare(b.farmerName ?? ''))
                  .map((payment) => {
                    const pid = payment.paymentId ?? payment._id
                    return (
                      <FarmerPaymentCard
                        key={pid}
                        payment={payment}
                        isReconciliation={isReconciliation}
                        isOpen={openPaymentFormId === pid}
                        formState={paymentForms[pid] ?? null}
                        saving={savingPaymentId === pid}
                        errorKey={paymentErrors[pid] ?? null}
                        onToggle={() => handleTogglePaymentForm(payment)}
                        onFormChange={(field, value) =>
                          handlePaymentFormChange(pid, field, value, payment)
                        }
                        onSave={() => handleSavePayment(payment)}
                        t={t}
                      />
                    )
                  })
              )}
            </div>
          )}

          {/* ── Tab C — Local Farmer Payments ─────────────────────────────── */}
          {activeTab === 'localPayments' && (
            <div>
              {localFarmerGroups.length === 0 ? (
                <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 text-sm text-[--color-text-secondary]">
                  {t('market_day.no_local_farmers')}
                </div>
              ) : (
                localFarmerGroups.map((farmerGroup) => {
                  const totalDuePaise = computeLocalTotalDue(farmerGroup, soldQtyDrafts)
                  const formState = getLocalFormState(farmerGroup.farmerId, totalDuePaise)
                  return (
                    <LocalFarmerPaymentCard
                      key={farmerGroup.farmerId}
                      farmerGroup={farmerGroup}
                      isReconciliation={isReconciliation}
                      isPaid={!!localFarmerPaidState[farmerGroup.farmerId]}
                      soldQtyDrafts={soldQtyDrafts}
                      totalDuePaise={totalDuePaise}
                      formState={formState}
                      saving={savingLocalFarmerId === farmerGroup.farmerId}
                      errorKey={localFarmerErrors[farmerGroup.farmerId] ?? null}
                      onSoldQtyChange={handleSoldQtyChange}
                      onFormChange={(field, value) =>
                        handleLocalPaymentFormChange(farmerGroup.farmerId, field, value)
                      }
                      onSave={() => handleSaveLocalPayment(farmerGroup, formState)}
                      t={t}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* ── Tab D — Delivery Edit ─────────────────────────────────────── */}
          {activeTab === 'deliveryEdit' && (
            <div>
              {isReconciliation && !correctionWindowOpen && (
                <div className="mb-3 rounded-xl border border-[--color-warning-light] bg-[--color-warning-light] p-4 text-sm text-[--color-warning]">
                  {t('reconciliation.correction_window_closed')}
                </div>
              )}
              {assignments.length === 0 ? (
                <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 text-sm text-[--color-text-secondary]">
                  {t('empty.delivery_list')}
                </div>
              ) : (
                assignments.map((assignment) => (
                  <DeliveryEditRow
                    key={assignment.assignmentId}
                    assignment={assignment}
                    editable={correctionWindowOpen}
                    draftQty={
                      deliveredDrafts[assignment.assignmentId] ??
                      String(assignment.deliveredQty ?? 0)
                    }
                    saving={savingAssignmentId === assignment.assignmentId}
                    rowErrorKey={deliveryRowErrors[assignment.assignmentId] ?? null}
                    onDraftChange={handleDeliveredDraftChange}
                    onSave={handleSaveDeliveredQty}
                    t={t}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ── Close Week ─────────────────────────────────────────────────────── */}
      {isReconciliation && weekId && (
        <div className="rounded-xl border border-[--color-border] bg-[--color-surface] p-4 space-y-3">
          {closeBlockers && closeBlockers.length > 0 && (
            <div role="alert">
              <p className="mb-2 text-sm font-medium text-[--color-error]">
                {t('reconciliation.close_blocked_header')}
              </p>
              <ul className="space-y-1.5">
                {closeBlockers.map((blocker) => (
                  <li key={`${blocker.type}-${blocker.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(BLOCKER_TAB_MAP[blocker.type] ?? 'priceDiff')
                        setCloseBlockers(null)
                      }}
                      className="w-full text-left text-sm text-[--color-error] underline underline-offset-2 hover:text-[--color-error]"
                    >
                      {blocker.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {closeWeekError && (
            <p className="text-sm text-[--color-error]" role="alert">{t(closeWeekError)}</p>
          )}
          {!closeWeekConfirm ? (
            <button
              type="button"
              onClick={() => { setCloseBlockers(null); setCloseWeekError(null); setCloseWeekConfirm(true) }}
              disabled={closingWeek}
              className="inline-flex items-center gap-2 rounded-xl bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
            >
              {t('transition.reconciliation_to_closed.button')}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[--color-text-secondary]">
                {t('transition.reconciliation_to_closed.confirm_body')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCloseWeek}
                  disabled={closingWeek}
                  className="inline-flex items-center gap-2 rounded-xl bg-[--color-error] px-4 py-2 text-sm font-medium text-[--color-text-inverse] disabled:opacity-60"
                >
                  {closingWeek && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
                  {t('transition.reconciliation_to_closed.confirm_title')}
                </button>
                <button
                  type="button"
                  onClick={() => setCloseWeekConfirm(false)}
                  disabled={closingWeek}
                  className="rounded-xl border border-[--color-border] px-4 py-2 text-sm font-medium text-[--color-text-secondary] disabled:opacity-60"
                >
                  {t('action.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[--color-border] bg-[--color-surface] p-4 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-[--color-text-primary]">{t(toast.key)}</p>
        </div>
      )}
    </div>
  )
}
