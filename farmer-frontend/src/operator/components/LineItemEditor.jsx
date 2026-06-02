import { LineItemRowIcon, Plus, X } from '../../shared/components/AppIcons.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { UNIT_TYPES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'

const UNIT_OPTIONS = Object.values(UNIT_TYPES)

export default function LineItemEditor ({ lineItems, produceList, onChange }) {
  const { lang, t } = useLang()

  const updateLine = (index, patch) => {
    const next = lineItems.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  const removeLine = (index) => {
    onChange(lineItems.filter((_, i) => i !== index))
  }

  const addLine = () => {
    onChange([
      ...lineItems,
      {
        localId: `new-${Date.now()}-${lineItems.length}`,
        productId: null,
        rawProductText: null,
        orderedQty: '',
        unit: '',
      },
    ])
  }

  const productLabel = (item) => (lang === 'ta' && item.nameTa ? item.nameTa : item.nameEn)

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[--color-text-primary]">
        {t('intake.parsed_preview_label')}
      </p>

      {lineItems.length === 0 ? null : (
        <div className="space-y-2">
          {lineItems.map((row, index) => {
            const unmatched = !row.productId

            return (
              <div
                key={row.localId}
                className="flex flex-wrap items-end gap-2 rounded-md border border-[--color-border] bg-[--color-background] p-2"
              >
                <LineItemRowIcon unmatched={unmatched} />
                <div className="min-w-[140px] flex-1">
                  <label className="mb-1 block text-xs text-[--color-text-secondary]">
                    {t('field.product')}
                  </label>
                  <select
                    value={row.productId ?? ''}
                    onChange={(e) => {
                      const productId = e.target.value || null
                      const produce = produceList.find((p) => p.productId === productId)
                      updateLine(index, {
                        productId,
                        rawProductText: null,
                        unit: produce?.unit ?? row.unit,
                      })
                    }}
                    className={`w-full min-h-[44px] rounded-md border px-2 py-2 text-sm text-[--color-text-primary] focus:border-[--color-primary] focus:outline-none focus:ring-1 focus:ring-[--color-primary] ${
                      unmatched ? 'border-[--color-warning]' : 'border-[--color-border]'
                    }`}
                  >
                    <option value="">
                      {unmatched && row.rawProductText
                        ? row.rawProductText
                        : `— ${t('field.product')} —`}
                    </option>
                    {produceList.map((item) => (
                      <option key={item.productId} value={item.productId}>
                        {productLabel(item)} ({formatINR(item.pricePerUnit)} / {t(`unit.${item.unit}`)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-24">
                  <label className="mb-1 block text-xs text-[--color-text-secondary]">
                    {t('field.quantity')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.orderedQty}
                    onChange={(e) => updateLine(index, { orderedQty: e.target.value })}
                    className="w-full min-h-[44px] rounded-md border border-[--color-border] px-2 py-2 text-sm focus:border-[--color-primary] focus:outline-none focus:ring-1 focus:ring-[--color-primary]"
                  />
                </div>

                <div className="w-28">
                  <label className="mb-1 block text-xs text-[--color-text-secondary]">
                    {t('field.unit')}
                  </label>
                  <select
                    value={row.unit}
                    onChange={(e) => updateLine(index, { unit: e.target.value })}
                    className="w-full min-h-[44px] rounded-md border border-[--color-border] px-2 py-2 text-sm focus:border-[--color-primary] focus:outline-none focus:ring-1 focus:ring-[--color-primary]"
                  >
                    <option value="">—</option>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>
                        {t(`unit.${unit}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[--color-error] hover:bg-[--color-error-light]"
                  aria-label={t('intake.remove_line_item')}
                >
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addLine}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-dashed border-[--color-border] px-4 py-2 text-sm font-medium text-[--color-primary] hover:border-[--color-primary]"
      >
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        {t('intake.add_line_item')}
      </button>
    </div>
  )
}

export function parsedItemsToEditorRows (parsedItems = []) {
  if (!parsedItems.length) {
    return [
      {
        localId: 'blank-0',
        productId: null,
        rawProductText: null,
        orderedQty: '',
        unit: '',
      },
    ]
  }

  return parsedItems.map((item, index) => ({
    localId: `parsed-${index}-${item.rawText ?? ''}`,
    productId: item.productId ?? null,
    rawProductText: item.rawProductText ?? item.rawText ?? null,
    orderedQty: item.quantity != null ? String(item.quantity) : '',
    unit: item.unit ?? '',
  }))
}

export function validateEditorLineItems (lineItems) {
  if (!lineItems.length) {
    return false
  }
  return lineItems.every((row) => {
    const qty = Number(row.orderedQty)
    return (
      row.productId &&
      row.unit &&
      Number.isFinite(qty) &&
      qty > 0
    )
  })
}

export function editorRowsToApiLineItems (lineItems) {
  return lineItems.map((row) => ({
    productId: row.productId,
    orderedQty: Number(row.orderedQty),
    unit: row.unit,
  }))
}
