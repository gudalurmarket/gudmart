import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import useWeekState from '../hooks/useWeekState.js'
import useSSE from '../hooks/useSSE.js'
import { useLang } from '../lib/LangContext.jsx'
import { apiPatch, TransitionGateBlockedError } from '../lib/api.js'
import { resolveWeekId } from '../lib/apiErrors.js'
import { ROLES, SSE_STATUS, WEEK_STATES } from '../lib/constants.js'
import {
  AppLogo,
  ArrowRight,
  ChevronRight,
  ChevronsRight,
  NavIcon,
  SseStatusIcons,
} from './AppIcons.jsx'
import StateMachineBadge from './StateMachineBadge.jsx'

const OPERATOR_NAV = [
  { to: '/operator/dashboard', labelKey: 'nav.dashboard' },
  { to: '/operator/intake', labelKey: 'nav.order_intake' },
  { to: '/operator/orders', labelKey: 'nav.order_management' },
  { to: '/operator/wallet', labelKey: 'nav.wallet_management' },
  { to: '/operator/delivery', labelKey: 'nav.delivery_management' },
  { to: '/operator/market-day', labelKey: 'nav.market_day' },
  { to: '/operator/reconciliation', labelKey: 'nav.reconciliation' },
  { to: '/operator/summary', labelKey: 'nav.weekly_summary' },
  { to: '/operator/registrations', labelKey: 'nav.registrations' },
]

const VOLUNTEER_NAV = [
  { to: '/volunteer/delivery', labelKey: 'nav.volunteer.delivery_entry' },
  { to: '/volunteer/packing', labelKey: 'nav.volunteer.packing_list' },
  { to: '/volunteer/dispatch', labelKey: 'nav.volunteer.dispatch' },
]

const STATE_TRANSITIONS = {
  [WEEK_STATES.SETUP]: { next: WEEK_STATES.OPEN, key: 'setup_to_open' },
  [WEEK_STATES.OPEN]: { next: WEEK_STATES.LOCKED, key: 'open_to_locked' },
  [WEEK_STATES.LOCKED]: { next: WEEK_STATES.DELIVERY, key: 'locked_to_delivery' },
  [WEEK_STATES.DELIVERY]: { next: WEEK_STATES.MARKET_DAY, key: 'delivery_to_market_day' },
  [WEEK_STATES.MARKET_DAY]: { next: WEEK_STATES.RECONCILIATION, key: 'market_day_to_reconciliation' },
  [WEEK_STATES.RECONCILIATION]: { next: WEEK_STATES.CLOSED, key: 'reconciliation_to_closed' },
}

function LanguageToggle () {
  const { lang, setLang, t } = useLang()

  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('lang.toggle_label')}>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`nav-pill min-h-[32px] min-w-[32px] px-2.5 ${lang === 'en' ? 'nav-pill-active' : 'text-[--color-text-secondary] hover:bg-[--color-surface-raised]'}`}
        aria-pressed={lang === 'en'}
        aria-label={t('lang.english')}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('ta')}
        className={`nav-pill min-h-[32px] min-w-[32px] px-2 font-tamil ${lang === 'ta' ? 'nav-pill-active' : 'text-[--color-text-secondary] hover:bg-[--color-surface-raised]'}`}
        aria-pressed={lang === 'ta'}
        aria-label={t('lang.tamil')}
      >
        த
      </button>
    </div>
  )
}

function SseStatusIndicator ({ status }) {
  const { t } = useLang()

  const isConnected = status === SSE_STATUS.CONNECTED
  const labelKey =
    status === SSE_STATUS.CONNECTED
      ? 'sse.status.connected'
      : status === SSE_STATUS.RECONNECTING
        ? 'sse.status.reconnecting'
        : 'sse.status.polling_fallback'

  return (
    <div className="hidden items-center gap-1.5 lg:flex" title={t(labelKey)}>
      <SseStatusIcons
        connected={isConnected}
        className={isConnected ? 'sse-pulse-dot' : undefined}
      />
      <span className="whitespace-nowrap text-xs text-[--color-text-secondary]">
        {t(labelKey)}
      </span>
    </div>
  )
}

function StateTransitionModal ({ open, onClose, week, state, onSuccess }) {
  const { t } = useLang()
  const [submitting, setSubmitting] = useState(false)
  const [blockers, setBlockers] = useState([])

  const transition = state ? STATE_TRANSITIONS[state] : null

  useEffect(() => {
    if (open) {
      setBlockers([])
    }
  }, [open, state])

  if (!open || !transition || !week) {
    return null
  }

  const { next, key } = transition
  const confirmTitleKey = `transition.${key}.confirm_title`
  const confirmBodyKey = `transition.${key}.confirm_body`
  const confirmButtonKey = `transition.${key}.button`
  const hasBlockers = blockers.length > 0

  const handleConfirm = async () => {
    if (hasBlockers) return
    setSubmitting(true)
    setBlockers([])
    try {
      const weekId = resolveWeekId(week)
      if (!weekId) return
      await apiPatch(`/api/v1/weeks/${weekId}/state`, { targetState: next })
      onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof TransitionGateBlockedError) {
        setBlockers(err.blockers ?? [])
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="state-transition-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[--color-surface] p-6 shadow-xl">
        <p className="text-xs font-medium uppercase tracking-wide text-[--color-text-secondary]">
          {t(confirmTitleKey)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StateMachineBadge state={state} compact />
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-[--color-text-secondary]"
            aria-hidden="true"
          />
          <StateMachineBadge state={next} compact />
        </div>

        <p className="mt-4 text-sm text-[--color-text-secondary]">
          {t(confirmBodyKey)}
        </p>

        {hasBlockers && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-[--color-warning]">
              {t('error.transition_gate_blocked')}
            </p>
            <ul className="space-y-2">
              {blockers.map((blocker, index) => (
                <li
                  key={blocker.id ?? blocker.message ?? index}
                  className="flex items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] p-3"
                  style={{ borderLeftWidth: '4px', borderLeftColor: 'var(--color-warning)' }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[--color-primary] text-xs font-semibold text-[--color-text-inverse]">
                    {(blocker.label ?? blocker.message ?? '?').slice(0, 2).toUpperCase()}
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-[--color-text-primary]">
                    {blocker.message ?? blocker.label ?? t('error.transition_gate_blocked')}
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm font-medium text-[--color-primary]"
                    >
                      {t('action.edit')}
                      <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="text-sm text-[--color-text-secondary]"
                      onClick={() =>
                        setBlockers((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      {t('action.cancel')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn-secondary w-full" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={hasBlockers || submitting}
            onClick={handleConfirm}
          >
            {submitting ? (
              t('action.loading')
            ) : (
              <span className="inline-flex items-center justify-center gap-1.5">
                <ChevronsRight size={16} strokeWidth={1.5} aria-hidden="true" />
                {t(confirmButtonKey)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function operatorNavLinkClass ({ isActive }) {
  const base =
    'flex min-w-[52px] flex-col items-center gap-0.5 px-1 py-1 text-xs text-[--color-text-secondary] transition-colors hover:text-[--color-primary]'
  return isActive
    ? `${base} font-semibold text-[--color-primary]`
    : base
}

function OperatorNavBar () {
  const { t } = useLang()
  const location = useLocation()
  const { week, state, refetch } = useWeekState()
  const [modalOpen, setModalOpen] = useState(false)

  const isIntakePage = location.pathname.startsWith('/operator/intake')
  const { status: sseStatus } = useSSE('/api/v1/events/intake-queue', {
    enabled: !isIntakePage,
  })

  const transition = state ? STATE_TRANSITIONS[state] : null
  const advanceButtonKey = transition ? `transition.${transition.key}.button` : null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b bg-[--color-surface] px-3 sm:px-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <NavLink
          to="/operator/dashboard"
          className="flex shrink-0 items-center gap-2 text-base font-semibold text-[--color-text-primary] hover:text-[--color-primary]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[--color-primary-light] text-[--color-primary]">
            <AppLogo size={20} />
          </span>
          <span className="hidden sm:inline">{t('app.name')}</span>
        </NavLink>

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto sm:gap-1">
          {OPERATOR_NAV.map(({ to, labelKey }) => (
            <NavLink key={to} to={to} className={operatorNavLinkClass} title={t(labelKey)}>
              <NavIcon to={to} />
              <span className="max-w-[4.5rem] truncate leading-tight">{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {state && (
            <div className="hidden sm:block">
              <StateMachineBadge state={state} compact />
            </div>
          )}

          <SseStatusIndicator status={isIntakePage ? SSE_STATUS.CONNECTED : sseStatus} />

          <LanguageToggle />

          {advanceButtonKey && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="max-w-[5.5rem] truncate rounded-full border px-2 py-1 text-xs font-medium text-[--color-text-secondary] transition-colors hover:border-[--color-primary] hover:text-[--color-primary] sm:max-w-none"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span className="inline-flex items-center gap-1">
                <ChevronsRight size={16} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{t(advanceButtonKey)}</span>
              </span>
            </button>
          )}
        </div>
      </header>

      <StateTransitionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        week={week}
        state={state}
        onSuccess={refetch}
      />
    </>
  )
}

function VolunteerNavBar () {
  const { t } = useLang()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-stretch border-t bg-[--color-surface]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {VOLUNTEER_NAV.map(({ to, labelKey }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition-colors ${
              isActive
                ? 'font-semibold text-[--color-primary]'
                : 'text-[--color-text-secondary] hover:text-[--color-primary]'
            }`
          }
        >
          <NavIcon to={to} />
          <span className="max-w-full truncate leading-tight">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default function NavBar () {
  const { role } = useAuth()

  if (role === ROLES.VOLUNTEER) {
    return <VolunteerNavBar />
  }

  if (role === ROLES.OPERATOR) {
    return <OperatorNavBar />
  }

  return null
}
