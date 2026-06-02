import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import useWeekState from '../hooks/useWeekState.js'
import useSSE from '../hooks/useSSE.js'
import { useLang } from '../lib/LangContext.jsx'
import { useTheme } from '../lib/ThemeContext.jsx'
import { ROLES, SSE_STATUS } from '../lib/constants.js'
import {
  AppLogo,
  NavIcon,
  SseStatusIcons,
  ThemeIcons,
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


function LogoutButton () {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { t } = useLang()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={signingOut}
      className="nav-pill min-h-[32px] whitespace-nowrap px-2.5 text-xs text-[--color-text-secondary] hover:bg-[--color-surface-raised] disabled:opacity-60"
      aria-busy={signingOut}
    >
      {signingOut ? t('action.loading') : t('auth.logout')}
    </button>
  )
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

function ThemeToggle () {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLang()
  const isDark = theme === 'dark'
  const label = isDark ? t('theme.switch_to_light') : t('theme.switch_to_dark')

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="nav-pill flex min-h-[32px] min-w-[32px] items-center justify-center text-[--color-text-secondary] hover:bg-[--color-surface-raised]"
      aria-label={label}
      title={label}
    >
      <ThemeIcons isDark={isDark} size={15} />
    </button>
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


function operatorNavLinkClass ({ isActive }) {
  const base = 'flex min-w-[52px] flex-col items-center gap-0.5 px-1 py-1 text-xs transition-colors'
  return isActive
    ? `${base} font-semibold text-[--color-primary]`
    : `${base} text-[--color-text-secondary] hover:text-[--color-primary]`
}

function OperatorNavBar () {
  const { t } = useLang()
  const location = useLocation()
  const { state } = useWeekState()

  const isIntakePage = location.pathname.startsWith('/operator/intake')
  const { status: sseStatus } = useSSE('/api/v1/events/intake-queue', {
    enabled: !isIntakePage,
  })

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b bg-[--color-surface] px-3 sm:px-4"
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

      <nav className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto scrollbar-none sm:gap-1">
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

        <ThemeToggle />

        <LogoutButton />
      </div>
    </header>
  )
}

function VolunteerNavBar () {
  const { t } = useLang()

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-40 flex h-10 items-center justify-end gap-2 border-b bg-[--color-surface] px-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <LanguageToggle />
        <ThemeToggle />
        <LogoutButton />
      </header>

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
    </>
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
