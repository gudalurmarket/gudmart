import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth.js'
import { useLang } from '../lib/LangContext.jsx'
import { useTheme } from '../lib/ThemeContext.jsx'
import { ICON_STROKE, ThemeIcons } from './AppIcons.jsx'

function SettingsMenuPanel ({ onClose, largeTouch }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { lang, setLang, t } = useLang()
  const { theme, toggleTheme } = useTheme()
  const [signingOut, setSigningOut] = useState(false)

  const isDark = theme === 'dark'
  const themeLabel = isDark ? t('theme.switch_to_light') : t('theme.switch_to_dark')

  const pillSize = largeTouch ? 'min-h-[44px] min-w-[44px]' : 'min-h-[32px] min-w-[32px]'

  const handleLogout = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      onClose()
      navigate('/login', { replace: true })
    } catch {
      setSigningOut(false)
    }
  }

  const handleThemeToggle = () => {
    toggleTheme()
    onClose()
  }

  const handleLangChange = (nextLang) => {
    setLang(nextLang)
    onClose()
  }

  return (
    <div
      role="menu"
      className="settings-menu-panel absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border bg-[--color-surface] py-2 shadow-lg"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        role="presentation"
        className="flex items-center justify-between gap-3 px-3 py-2"
      >
        <span className="text-xs font-medium text-[--color-text-secondary]">
          {t('lang.toggle_label')}
        </span>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('lang.toggle_label')}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={lang === 'en'}
            onClick={() => handleLangChange('en')}
            className={`nav-pill ${pillSize} px-2.5 ${lang === 'en' ? 'nav-pill-active' : 'text-[--color-text-secondary] hover:bg-[--color-surface-raised]'}`}
          >
            EN
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={lang === 'ta'}
            onClick={() => handleLangChange('ta')}
            className={`nav-pill ${pillSize} px-2 font-tamil ${lang === 'ta' ? 'nav-pill-active' : 'text-[--color-text-secondary] hover:bg-[--color-surface-raised]'}`}
          >
            த
          </button>
        </div>
      </div>

      <button
        type="button"
        role="menuitem"
        onClick={handleThemeToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[--color-text-primary] transition-colors hover:bg-[--color-surface-raised]"
      >
        <ThemeIcons isDark={isDark} size={16} />
        <span>{themeLabel}</span>
      </button>

      <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />

      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        disabled={signingOut}
        aria-busy={signingOut}
        className={`flex w-full items-center px-3 py-2 text-left text-sm text-[--color-text-secondary] transition-colors hover:bg-[--color-surface-raised] disabled:opacity-60 ${largeTouch ? 'min-h-[44px]' : 'min-h-[36px]'}`}
      >
        {signingOut ? t('action.loading') : t('auth.logout')}
      </button>
    </div>
  )
}

export default function SettingsMenu ({ largeTouch = false }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const touchClass = largeTouch
    ? 'min-h-[44px] min-w-[44px]'
    : 'min-h-[32px] min-w-[32px]'

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`settings-gear-btn nav-pill flex items-center justify-center text-[--color-text-secondary] hover:bg-[--color-surface-raised] ${touchClass}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('settings.menu_label')}
        title={t('settings.menu_label')}
      >
        <Settings
          size={16}
          strokeWidth={ICON_STROKE}
          className={`settings-gear-icon ${open ? 'settings-gear-icon-open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <SettingsMenuPanel onClose={() => setOpen(false)} largeTouch={largeTouch} />
      )}
    </div>
  )
}
