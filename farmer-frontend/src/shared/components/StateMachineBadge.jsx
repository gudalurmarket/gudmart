import { useLang } from '../lib/LangContext.jsx'
import { STATE_BADGE_CLASS } from '../lib/constants.js'

function formatBadgeLabel (state) {
  if (state == null) return ''
  return state.replace(/_/g, ' ').toUpperCase()
}

export default function StateMachineBadge ({ state, className, compact = false }) {
  const { t } = useLang()

  if (state == null) {
    return null
  }

  const badgeClass = STATE_BADGE_CLASS[state] ?? ''
  const label = compact ? formatBadgeLabel(state) : t(`week.state.${state}`)

  return (
    <span
      className={`${badgeClass} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${compact ? 'uppercase' : ''} ${className ?? ''}`}
    >
      {label}
    </span>
  )
}
