import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useLang } from '../lib/LangContext.jsx'
import { AppLogo, ICON_STROKE, NavIcon } from './AppIcons.jsx'

function sideNavLinkClass ({ isActive }, largeTouch) {
  const height = largeTouch ? 'min-h-[44px]' : 'min-h-[40px]'
  const base = `flex ${height} items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors`
  return isActive
    ? `${base} bg-[--color-primary-light] text-[--color-primary]`
    : `${base} text-[--color-text-primary] hover:bg-[--color-surface-raised]`
}

export function HamburgerButton ({ open, onClick, largeTouch = false }) {
  const { t } = useLang()
  const touchClass = largeTouch ? 'min-h-[44px] min-w-[44px]' : 'min-h-[40px] min-w-[40px]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`nav-pill flex shrink-0 items-center justify-center text-[--color-text-secondary] hover:bg-[--color-surface-raised] ${touchClass}`}
      aria-expanded={open}
      aria-controls="app-side-nav"
      aria-label={open ? t('nav.menu.close') : t('nav.menu.open')}
    >
      {open ? (
        <X size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
      ) : (
        <Menu size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
      )}
    </button>
  )
}

export default function SideNavDrawer ({ items, open, onClose, largeTouch = false }) {
  const { t } = useLang()

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  return (
    <>
      <div
        className={`fixed inset-0 z-[45] bg-black/40 transition-opacity duration-200 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
        onClick={onClose}
      />

      <aside
        id="app-side-nav"
        aria-hidden={!open}
        className={`fixed left-0 top-0 z-50 flex h-full w-[min(280px,85vw)] flex-col border-r bg-[--color-surface] shadow-xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="flex h-14 shrink-0 items-center gap-3 border-b px-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[--color-primary-light] text-[--color-primary]">
            <AppLogo size={20} />
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-[--color-text-primary]">
            {t('app.name')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`nav-pill flex shrink-0 items-center justify-center text-[--color-text-secondary] hover:bg-[--color-surface-raised] ${
              largeTouch ? 'min-h-[44px] min-w-[44px]' : 'min-h-[40px] min-w-[40px]'
            }`}
            aria-label={t('nav.menu.close')}
          >
            <X size={20} strokeWidth={ICON_STROKE} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={t('nav.menu.title')}>
          <ul className="flex flex-col gap-0.5">
            {items.map(({ to, labelKey }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={(state) => sideNavLinkClass(state, largeTouch)}
                  onClick={onClose}
                >
                  <NavIcon to={to} size={20} />
                  <span className="leading-snug">{t(labelKey)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}
