import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { Sprout } from 'lucide-react'
import useAuth from '../shared/hooks/useAuth.js'
import { useLang } from '../shared/lib/LangContext.jsx'
import { auth } from '../shared/lib/firebase.js'
import { ROLES } from '../shared/lib/constants.js'
import LoadingSpinner from '../shared/components/LoadingSpinner.jsx'
import '../shared/styles/colors_and_type.css'
import './login-page.css'

function EyeIcon ({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

function LoginBackground () {
  return (
    <>
      <div className="login-grain" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg">
          <filter id="login-grain-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#login-grain-filter)" />
        </svg>
      </div>

      <svg className="botanical-tr" viewBox="0 0 280 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g transform="translate(180, 40) rotate(28)">
          <ellipse cx="0" cy="0" rx="52" ry="22" fill="rgba(38, 68, 18, 0.28)" stroke="rgba(90, 148, 38, 0.08)" strokeWidth="1" />
        </g>
        <g transform="translate(220, 90) rotate(-12)">
          <ellipse cx="0" cy="0" rx="44" ry="18" fill="rgba(32, 58, 14, 0.24)" stroke="rgba(90, 148, 38, 0.07)" strokeWidth="1" />
        </g>
        <g transform="translate(140, 120) rotate(52)">
          <ellipse cx="0" cy="0" rx="38" ry="16" fill="rgba(45, 72, 16, 0.22)" stroke="rgba(90, 148, 38, 0.06)" strokeWidth="1" />
        </g>
        <g transform="translate(200, 160) rotate(8)">
          <ellipse cx="0" cy="0" rx="60" ry="24" fill="rgba(28, 52, 12, 0.30)" stroke="rgba(90, 148, 38, 0.09)" strokeWidth="1" />
        </g>
        <g transform="translate(100, 60) rotate(-34)">
          <ellipse cx="0" cy="0" rx="34" ry="14" fill="rgba(40, 62, 16, 0.20)" stroke="rgba(90, 148, 38, 0.06)" strokeWidth="1" />
        </g>
        <g transform="translate(240, 200) rotate(42)">
          <ellipse cx="0" cy="0" rx="46" ry="19" fill="rgba(35, 55, 14, 0.26)" stroke="rgba(90, 148, 38, 0.08)" strokeWidth="1" />
        </g>
      </svg>

      <svg className="botanical-bl" viewBox="0 0 260 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g transform="translate(60, 200) rotate(-18)">
          <ellipse cx="0" cy="0" rx="56" ry="23" fill="rgba(30, 55, 12, 0.26)" stroke="rgba(90, 148, 38, 0.08)" strokeWidth="1" />
        </g>
        <g transform="translate(120, 240) rotate(22)">
          <ellipse cx="0" cy="0" rx="42" ry="17" fill="rgba(38, 65, 16, 0.22)" stroke="rgba(90, 148, 38, 0.07)" strokeWidth="1" />
        </g>
        <g transform="translate(30, 140) rotate(-38)">
          <ellipse cx="0" cy="0" rx="48" ry="20" fill="rgba(25, 48, 10, 0.28)" stroke="rgba(90, 148, 38, 0.09)" strokeWidth="1" />
        </g>
        <g transform="translate(150, 180) rotate(14)">
          <ellipse cx="0" cy="0" rx="36" ry="15" fill="rgba(42, 70, 18, 0.20)" stroke="rgba(90, 148, 38, 0.06)" strokeWidth="1" />
        </g>
      </svg>
    </>
  )
}

export default function LoginPage () {
  const { user, role, loading, error, signIn } = useAuth()
  const { lang, setLang, t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetError, setResetError] = useState(null)
  const [resetSuccessMessage, setResetSuccessMessage] = useState(null)

  if (loading) {
    return (
      <div className="login-scene">
        <LoginBackground />
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

  const handleShowResetForm = () => {
    setResetEmail(email)
    setResetError(null)
    setResetSuccessMessage(null)
    setShowResetForm(true)
  }

  const handleBackToLogin = () => {
    setShowResetForm(false)
    setResetError(null)
  }

  const handleResetSubmit = async (event) => {
    event.preventDefault()
    setResetSubmitting(true)
    setResetError(null)
    try {
      await sendPasswordResetEmail(auth, resetEmail)
      setShowResetForm(false)
      setResetSuccessMessage(t('auth.reset_email_sent'))
    } catch (err) {
      setResetError(err?.message || t('login.error'))
    } finally {
      setResetSubmitting(false)
    }
  }

  const isBusy = loading || submitting
  const isResetBusy = resetSubmitting

  return (
    <div className="login-scene">
      <LoginBackground />

      <div className="login-card">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="login-sprout">
              <Sprout size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h1 className="login-wordmark">
              {t('app.name')}
            </h1>
          </div>
          <div className="login-lang-toggle shrink-0" role="group" aria-label={t('lang.toggle_label')}>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`login-lang-btn ${lang === 'en' ? 'login-lang-btn-active' : ''}`}
              aria-pressed={lang === 'en'}
              aria-label={t('lang.english')}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('ta')}
              className={`login-lang-btn ${lang === 'ta' ? 'login-lang-btn-active' : ''}`}
              style={{ fontFamily: 'var(--font-tamil)' }}
              aria-pressed={lang === 'ta'}
              aria-label={t('lang.tamil')}
            >
              த
            </button>
          </div>
        </div>

        <h2 className="login-title mb-6">
          {showResetForm ? t('auth.reset_password') : t('login.title')}
        </h2>

        {showResetForm ? (
          <form onSubmit={handleResetSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="reset-email"
                className="login-field-label"
              >
                {t('login.email')}
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={t('auth.enter_email')}
                className="login-input"
              />
            </div>

            <button
              type="submit"
              disabled={isResetBusy}
              className="login-submit"
            >
              {isResetBusy ? <LoadingSpinner size="sm" label="" /> : t('auth.reset_password')}
            </button>

            {resetError && (
              <p className="login-error" role="alert">
                {resetError}
              </p>
            )}

            <button
              type="button"
              onClick={handleBackToLogin}
              className="login-forgot block w-full border-none bg-transparent p-0 cursor-pointer text-center"
            >
              {t('auth.back_to_login')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="login-field-label"
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
                className="login-input"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="login-field-label"
                  style={{ marginBottom: 0 }}
                >
                  {t('login.password')}
                </label>
                <button
                  type="button"
                  onClick={handleShowResetForm}
                  className="login-forgot border-none bg-transparent p-0 cursor-pointer"
                >
                  {t('auth.forgot_password')}
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password.placeholder')}
                  className="login-input"
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="login-eye-btn"
                  aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="login-submit"
            >
              {isBusy ? <LoadingSpinner size="sm" label="" /> : t('login.submit')}
            </button>

            {resetSuccessMessage && (
              <p className="text-[0.8125rem] text-[var(--dn-leaf)]" role="status">
                {resetSuccessMessage}
              </p>
            )}

            {error && (
              <p className="login-error" role="alert">
                {t('login.error')}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
