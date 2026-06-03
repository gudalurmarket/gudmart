import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import useWeekState from '../hooks/useWeekState.js'
import useSSE from '../hooks/useSSE.js'
import { useLang } from '../lib/LangContext.jsx'
import { ROLES, SSE_STATUS } from '../lib/constants.js'
import {
  AppLogo,
  NavIcon,
  SseStatusIcons,
} from './AppIcons.jsx'
import SettingsMenu from './SettingsMenu.jsx'
import SideNavDrawer, { HamburgerButton } from './SideNavDrawer.jsx'
import StateMachineBadge from './StateMachineBadge.jsx'

export const OPERATOR_NAV = [
  { to: '/operator/dashboard', labelKey: 'nav.dashboard' },
  { to: '/operator/intake', labelKey: 'nav.order_intake' },
  { to: '/operator/orders', labelKey: 'nav.order_management' },
  { to: '/operator/wallet', labelKey: 'nav.wallet_management' },
  { to: '/operator/delivery', labelKey: 'nav.delivery_management' },
  { to: '/operator/market-day', labelKey: 'nav.market_day' },
  { to: '/operator/reconciliation', labelKey: 'nav.reconciliation' },
  { to: '/operator/summary', labelKey: 'nav.weekly_summary' },
  { to: '/operator/history/weeks', labelKey: 'nav.history' },
  { to: '/operator/registrations', labelKey: 'nav.registrations' },
]

/** Quick-access tabs shown on the operator bottom bar (also listed in OPERATOR_NAV / side menu). */
export const OPERATOR_BOTTOM_NAV = [
  { to: '/operator/dashboard', labelKey: 'nav.dashboard' },
  { to: '/operator/orders', labelKey: 'nav.order_management' },
  { to: '/operator/delivery', labelKey: 'nav.delivery_management' },
  { to: '/operator/reconciliation', labelKey: 'nav.reconciliation' },
  { to: '/operator/registrations', labelKey: 'nav.registrations', end: false },
]

export const VOLUNTEER_NAV = [
  { to: '/volunteer/delivery', labelKey: 'nav.volunteer.delivery_entry' },
  { to: '/volunteer/packing', labelKey: 'nav.volunteer.packing_list' },
  { to: '/volunteer/dispatch', labelKey: 'nav.volunteer.dispatch' },
]


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
    <div className="flex items-center gap-1.5" title={t(labelKey)}>
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

function bottomNavLinkClass ({ isActive }) {
  return `flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition-colors ${
    isActive
      ? 'font-semibold text-[--color-primary]'
      : 'text-[--color-text-secondary] hover:text-[--color-primary]'
  }`
}

function OperatorBottomNav () {
  const { t } = useLang()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-stretch border-t bg-[--color-surface]"
      style={{ borderColor: 'var(--color-border)' }}
      aria-label={t('nav.bottom.title')}
    >
      {OPERATOR_BOTTOM_NAV.map(({ to, labelKey, end: linkEnd }) => (
        <NavLink
          key={to}
          to={to}
          end={linkEnd !== false}
          className={bottomNavLinkClass}
          title={t(labelKey)}
        >
          <NavIcon to={to} />
          <span className="max-w-full truncate leading-tight">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function AppHeader ({ children, menuOpen, onMenuToggle, largeTouch = false }) {
  const { t } = useLang()

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-2 border-b bg-[--color-surface] px-3 sm:gap-3 sm:px-4"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <HamburgerButton open={menuOpen} onClick={onMenuToggle} largeTouch={largeTouch} />

      <NavLink
        to={largeTouch ? '/volunteer/delivery' : '/operator/dashboard'}
        className="flex min-w-0 items-center gap-2 text-base font-semibold text-[--color-text-primary] hover:text-[--color-primary]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[--color-primary-light] text-[--color-primary]">
          <AppLogo size={20} />
        </span>
        <span className="hidden truncate sm:inline">{t('app.name')}</span>
      </NavLink>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {children}
      </div>
    </header>
  )
}

function OperatorNavBar () {
  const location = useLocation()
  const { state } = useWeekState()
  const [menuOpen, setMenuOpen] = useState(false)

  const isIntakePage = location.pathname.startsWith('/operator/intake')
  const { status: sseStatus } = useSSE('/api/v1/events/intake-queue', {
    enabled: !isIntakePage,
  })

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const toggleMenu = () => setMenuOpen((prev) => !prev)

  return (
    <>
      <SideNavDrawer
        items={OPERATOR_NAV}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <AppHeader menuOpen={menuOpen} onMenuToggle={toggleMenu}>
        {state && (
          <div className="hidden sm:block">
            <StateMachineBadge state={state} compact />
          </div>
        )}
        <SseStatusIndicator status={isIntakePage ? SSE_STATUS.CONNECTED : sseStatus} />
        <SettingsMenu />
      </AppHeader>

      <OperatorBottomNav />
    </>
  )
}

function VolunteerNavBar () {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const toggleMenu = () => setMenuOpen((prev) => !prev)

  return (
    <>
      <SideNavDrawer
        items={VOLUNTEER_NAV}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        largeTouch
      />

      <AppHeader menuOpen={menuOpen} onMenuToggle={toggleMenu} largeTouch>
        <SettingsMenu largeTouch />
      </AppHeader>
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
