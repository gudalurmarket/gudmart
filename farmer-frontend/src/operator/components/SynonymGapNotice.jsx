import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiGet } from '../../shared/lib/api.js'

/**
 * Tells the operator when catalogue products have no entry in the synonym table.
 * The fix is a manual LLM pass run by the IT manager (the system never calls an
 * AI service), so the notice offers a ready-to-send request to copy into WhatsApp.
 *
 * `refreshKey` — bump it to re-check (e.g. after a product is added).
 */
export default function SynonymGapNotice ({ refreshKey = 0 }) {
  const { t } = useLang()
  const [gaps, setGaps] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiGet('/api/v1/admin/synonyms/gaps')
      .then((data) => { if (!cancelled) setGaps(data) })
      .catch(() => { if (!cancelled) setGaps(null) }) // a missing notice must never break the screen
    return () => { cancelled = true }
  }, [refreshKey])

  if (!gaps || gaps.count === 0) return null

  const names = gaps.missing.map((p) => p.nameEn).join(', ')
  const requestText = t('catalogue.synonym_gap.request_text')
    .replace('{{count}}', String(gaps.count))
    .replace('{{names}}', names)

  const handleCopy = async (event) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(requestText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard unavailable — the request text is still visible below
    }
  }

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-[--color-warning] bg-[--color-warning-light] p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-sm font-medium text-[--color-text-primary]">
        {t('catalogue.synonym_gap.title').replace('{{count}}', String(gaps.count))}
      </p>
      <p className="mt-1 text-sm text-[--color-text-secondary]">{names}</p>
      <p className="mt-2 text-sm text-[--color-text-secondary]">{t('catalogue.synonym_gap.ask')}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[--color-warning] px-3 py-2 text-sm font-medium text-[--color-text-primary]"
      >
        <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
        {copied ? t('catalogue.synonym_gap.copied') : t('catalogue.synonym_gap.copy')}
      </button>
    </div>
  )
}
