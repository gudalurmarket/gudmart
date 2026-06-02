import { Component } from 'react'
import { useLang } from '../lib/LangContext.jsx'

function DefaultFallback ({ error }) {
  const { t } = useLang()

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[--color-background] p-6">
      <div className="w-full max-w-md rounded-lg bg-[--color-surface] p-6 shadow-md">
        <h1 className="text-xl font-semibold leading-tight text-[--color-text-primary]">
          {t('error.boundary.title')}
        </h1>
        <p className="mt-2 text-base leading-normal text-[--color-text-secondary]">
          {t('error.boundary.body')}
        </p>
        {error && (
          <p className="mt-4 text-sm text-[--color-error]" role="alert">
            {error.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-[--color-primary] px-4 py-2 font-medium text-[--color-text-inverse] hover:bg-[--color-primary-dark]"
        >
          {t('action.reload')}
        </button>
      </div>
    </div>
  )
}

export default class ErrorBoundary extends Component {
  constructor (props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError (error) {
    return { hasError: true, error }
  }

  componentDidCatch (error, info) {
    console.error(error, info)
  }

  render () {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return <DefaultFallback error={this.state.error} />
    }
    return this.props.children
  }
}
