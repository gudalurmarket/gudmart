import { Inbox, SseStatusIcons } from '../../shared/components/AppIcons.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { SSE_STATUS } from '../../shared/lib/constants.js'

const SSE_STATUS_KEYS = {
  [SSE_STATUS.CONNECTED]: 'sse.status.connected',
  [SSE_STATUS.RECONNECTING]: 'sse.status.reconnecting',
  [SSE_STATUS.POLLING_FALLBACK]: 'sse.status.polling_fallback',
}

export default function IntakeQueueHeader ({ count, sseStatus }) {
  const { t } = useLang()
  const sseKey = SSE_STATUS_KEYS[sseStatus]

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
      <div className="flex flex-wrap items-center gap-3">
        <Inbox size={24} strokeWidth={1.5} className="text-[--color-primary]" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-[--color-text-primary]">
          {t('nav.order_intake')}
        </h1>
        <span
          className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full bg-[--color-primary] px-2.5 text-sm font-medium text-white"
          aria-label={t('nav.order_intake')}
        >
          {count}
        </span>
      </div>
      {sseKey && (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[--color-text-secondary]"
          title={t(sseKey)}
        >
          <SseStatusIcons connected={sseStatus === SSE_STATUS.CONNECTED} />
          {t(sseKey)}
        </span>
      )}
    </div>
  )
}
