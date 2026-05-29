import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../shared/hooks/useAuth.js'
import { useLang } from '../shared/lib/LangContext.jsx'
import { ROLES } from '../shared/lib/constants.js'
import { AppLogo } from '../shared/components/AppIcons.jsx'
import LoadingSpinner from '../shared/components/LoadingSpinner.jsx'

export default function LoginPage () {
  const { user, role, loading, error, signIn } = useAuth()
  const { lang, setLang, t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[--color-background]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (user && role === ROLES.OPERATOR) {
    return <Navigate to="/operator/dashboard" replace />
  }

  if (user && role === ROLES.VOLUNTEER) {
    return <Navigate to="/volunteer/delivery" replace />
  }

  if (user) {
    return <Navigate to="/login" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch {
      // Error state is set in useAuth
    } finally {
      setSubmitting(false)
    }
  }

  const isBusy = loading || submitting

  return (
    <div className="flex min-h-screen items-center justify-center bg-[--color-background] p-6">
      <div className="w-full max-w-md rounded-2xl border bg-[--color-surface] p-8 shadow-sm"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-primary-light] text-[--color-primary]">
              <AppLogo size={24} />
            </span>
            <h1 className="text-2xl font-bold text-[--color-text-primary]">
              {t('app.name')}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('lang.toggle_label')}>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`nav-pill min-h-[44px] min-w-[44px] ${lang === 'en' ? 'nav-pill-active' : 'text-[--color-text-secondary]'}`}
              aria-pressed={lang === 'en'}
              aria-label={t('lang.english')}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('ta')}
              className={`nav-pill min-h-[44px] min-w-[44px] font-tamil ${lang === 'ta' ? 'nav-pill-active' : 'text-[--color-text-secondary]'}`}
              aria-pressed={lang === 'ta'}
              aria-label={t('lang.tamil')}
            >
              த
            </button>
          </div>
        </div>

        <h2 className="mb-6 text-lg font-semibold text-[--color-text-primary]">
          {t('login.title')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-sm font-medium text-[--color-text-primary]"
            >
              {t('login.email')}
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.email.placeholder')}
              className="input-field"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-[--color-text-primary]"
            >
              {t('login.password')}
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.password.placeholder')}
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="btn-primary w-full"
          >
            {isBusy ? <LoadingSpinner size="sm" label="" /> : t('login.submit')}
          </button>

          {error && (
            <p className="text-sm text-[--color-error]" role="alert">
              {t('login.error')}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
