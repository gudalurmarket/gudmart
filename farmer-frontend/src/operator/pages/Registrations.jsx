import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, Users, Wheat } from 'lucide-react'
import StateMachineBadge from '../../shared/components/StateMachineBadge.jsx'
import { useLang } from '../../shared/lib/LangContext.jsx'
import useWeekState from '../../shared/hooks/useWeekState.js'

const CARDS = [
  {
    path: '/operator/registrations/customers',
    icon: Users,
    titleKey: 'registration.customer.title',
    descKey: 'nav.customers',
  },
  {
    path: '/operator/registrations/farmers',
    icon: Wheat,
    titleKey: 'registration.farmer.title',
    descKey: 'nav.farmers',
  },
  {
    path: '/operator/registrations/catalogue',
    icon: BookOpen,
    titleKey: 'registration.catalogue.title',
    descKey: 'nav.catalogue',
  },
]

export default function Registrations () {
  const { t } = useLang()
  const { state } = useWeekState()
  const navigate = useNavigate()

  return (
    <div className="min-h-full bg-[--color-background] p-4 pb-24">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-[--color-text-primary]">
          {t('nav.registrations')}
        </h1>
        <StateMachineBadge state={state} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map(({ path, icon: Icon, titleKey }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className="flex items-center justify-between rounded-xl border border-[--color-border] bg-[--color-surface] p-5 text-left shadow-sm hover:border-[--color-primary] hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[--color-background] text-[--color-primary]">
                <Icon size={20} strokeWidth={1.5} />
              </span>
              <span className="text-sm font-medium text-[--color-text-primary]">{t(titleKey)}</span>
            </div>
            <ChevronRight size={18} strokeWidth={1.5} className="shrink-0 text-[--color-text-disabled]" />
          </button>
        ))}
      </div>
    </div>
  )
}
