import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, UserX } from '../../shared/components/AppIcons.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import { apiPatch, ApiError } from '../../shared/lib/api.js'
import { ORDER_STATUS, PARSE_STATUS } from '../../shared/lib/constants.js'
import LineItemEditor, {
  editorRowsToApiLineItems,
  parsedItemsToEditorRows,
  validateEditorLineItems,
} from './LineItemEditor.jsx'

function apiErrorTranslationKey (err) {
  if (!(err instanceof ApiError)) {
    return 'error.unknown'
  }
  const codeMap = {
    WALLET_INSUFFICIENT: 'error.wallet_insufficient',
    ACTION_NOT_PERMITTED_IN_STATE: 'error.action_not_permitted_in_state',
    DUPLICATE_MESSAGE: 'error.duplicate_message',
    UNKNOWN_SENDER: 'error.unknown_sender',
    CUSTOMER_NOT_FOUND: 'error.customer_not_found',
    MESSAGE_NOT_FOUND: 'error.order_not_found',
    FORBIDDEN: 'error.forbidden',
    UNAUTHORISED: 'error.unauthorised',
  }
  return codeMap[err.code] ?? 'error.unknown'
}

function formatFcfsTimestamp (isoString, lang) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function parseStatusBadgeClass (parseStatus) {
  switch (parseStatus) {
    case PARSE_STATUS.CLEAN:
      return 'bg-green-100 text-green-800'
    case PARSE_STATUS.PARTIAL:
    case PARSE_STATUS.MANUAL_REQUIRED:
      return 'bg-amber-100 text-amber-800'
    case PARSE_STATUS.NO_ACTIVE_WEEK:
    case PARSE_STATUS.UNKNOWN_SENDER:
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export default function ParsedMessageCard ({
  message,
  produceList,
  weekId,
  onProcessed,
}) {
  const { lang, t } = useLang()
  const [lineItems, setLineItems] = useState(() => parsedItemsToEditorRows(message.parsedItems))
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState(false)
  const [apiErrorKey, setApiErrorKey] = useState(null)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const unknownCustomer = message.customerId == null
  const parseStatusKey = `parse.status.${message.parseStatus}`
  const customerDisplay =
    message.customerName ?? t('intake.unknown_customer')

  const handleApprove = async () => {
    setValidationError(false)
    setApiErrorKey(null)

    if (!validateEditorLineItems(lineItems)) {
      setValidationError(true)
      return
    }

    setSubmitting(true)
    try {
      const result = await apiPatch(
        `/api/v1/weeks/${weekId}/intake/${message.messageId}`,
        {
          action: 'approve',
          lineItems: editorRowsToApiLineItems(lineItems),
        },
      )
      onProcessed(message.messageId, {
        action: 'approve',
        order: result.order,
        shortfallAmount: result.shortfallAmount,
      })
    } catch (err) {
      setApiErrorKey(apiErrorTranslationKey(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRejectConfirm = async () => {
    setApiErrorKey(null)
    setSubmitting(true)
    try {
      await apiPatch(
        `/api/v1/weeks/${weekId}/intake/${message.messageId}`,
        {
          action: 'reject',
          operatorNotes: rejectNote.trim() || undefined,
        },
      )
      onProcessed(message.messageId, { action: 'reject' })
    } catch (err) {
      setApiErrorKey(apiErrorTranslationKey(err))
    } finally {
      setSubmitting(false)
    }
  }

  const renderMessageBody = () => {
    if (message.mediaType === 'audio') {
      return (
        <p className="text-sm text-[--color-text-secondary]">
          {t('intake.voice_note_instruction')}
        </p>
      )
    }
    if (message.mediaType === 'image') {
      return (
        <p className="text-sm text-[--color-text-secondary]">
          {t('intake.image_instruction')}
        </p>
      )
    }
    return (
      <pre className="whitespace-pre-wrap rounded-md bg-[--color-background] p-3 font-mono text-sm text-[--color-text-primary]">
        {message.body ?? ''}
      </pre>
    )
  }

  return (
    <article className="rounded-lg border border-gray-200 bg-[--color-surface] p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[--color-text-primary]">
            {customerDisplay}
            {unknownCustomer && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[--color-warning-light] px-2 py-0.5 text-xs font-medium text-[--color-warning]"
                title={t('parse.status.unknown_sender')}
              >
                <UserX size={14} strokeWidth={1.5} aria-hidden="true" />
                {t('parse.status.unknown_sender')}
              </span>
            )}
          </h2>
          <p className="text-xs text-[--color-text-secondary]">
            {t('intake.fcfs_timestamp_label')}:{' '}
            {formatFcfsTimestamp(message.fcfsTimestamp, lang)}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${parseStatusBadgeClass(message.parseStatus)}`}
        >
          {t(parseStatusKey)}
        </span>
      </header>

      <div className="mb-4">
        <p className="mb-1 text-sm font-medium text-[--color-text-primary]">
          {t('intake.original_message_label')}
        </p>
        {renderMessageBody()}
      </div>

      {message.parseStatus === PARSE_STATUS.NO_ACTIVE_WEEK && (
        <p className="mb-4 text-sm text-amber-700" role="note">
          {t('intake.no_active_week_instruction')}
        </p>
      )}

      <LineItemEditor
        lineItems={lineItems}
        produceList={produceList}
        onChange={setLineItems}
      />

      {validationError && (
        <p className="mt-3 text-sm text-[--color-error]" role="alert">
          {t('intake.validation.line_items')}
        </p>
      )}

      {apiErrorKey && (
        <p className="mt-3 text-sm text-[--color-error]" role="alert">
          {t(apiErrorKey)}
        </p>
      )}

      {unknownCustomer && (
        <div
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="alert"
        >
          <p>{t('error.unknown_sender')}</p>
          <Link
            to="/operator/registrations"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-medium text-[--color-primary] underline"
          >
            {t('intake.register_customer')}
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      )}

      {!showRejectForm ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={submitting || unknownCustomer}
            className="min-h-[44px] rounded-md bg-[--color-primary] px-4 py-2 text-sm font-medium text-white hover:bg-[--color-primary-dark] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('action.approve')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRejectForm(true)
              setApiErrorKey(null)
            }}
            disabled={submitting}
            className="min-h-[44px] rounded-md border border-[--color-error] px-4 py-2 text-sm font-medium text-[--color-error] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('action.reject')}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3 rounded-md border border-gray-200 p-3">
          <div>
            <label
              htmlFor={`reject-note-${message.messageId}`}
              className="mb-1 block text-sm font-medium text-[--color-text-primary]"
            >
              {t('field.notes')}
            </label>
            <textarea
              id={`reject-note-${message.messageId}`}
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={t('field.notes.placeholder')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[--color-primary] focus:outline-none focus:ring-1 focus:ring-[--color-primary]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={submitting}
              className="min-h-[44px] rounded-md bg-[--color-error] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('action.confirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false)
                setRejectNote('')
              }}
              disabled={submitting}
              className="min-h-[44px] rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[--color-text-secondary] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('action.cancel')}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

export function buildApproveToast (result) {
  if (result?.order?.status === ORDER_STATUS.PENDING_PAYMENT) {
    return {
      key: 'toast.order_reverted_pending_payment',
      shortfallAmount: result.shortfallAmount ?? null,
    }
  }
  if (result?.order?.status === ORDER_STATUS.CONFIRMED) {
    return { key: 'toast.order_approved', shortfallAmount: null }
  }
  return null
}
