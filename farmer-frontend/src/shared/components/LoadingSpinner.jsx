import { useLang } from '../lib/LangContext.jsx'

const SIZE_CLASSES = {
  sm: 'h-4 w-4 border-[2px]',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
}

export default function LoadingSpinner ({ size = 'md', label }) {
  const { t } = useLang()
  const displayLabel = label ?? t('action.loading')

  return (
    <div className="flex flex-col items-center justify-center gap-3" role="status">
      <div
        className={`${SIZE_CLASSES[size] ?? SIZE_CLASSES.md} animate-spin rounded-full border-t-transparent`}
        style={{
          borderColor: 'var(--color-primary)',
          borderTopColor: 'transparent',
        }}
        aria-hidden="true"
      />
      {displayLabel && (
        <p className="text-sm text-[--color-text-secondary]">{displayLabel}</p>
      )}
    </div>
  )
}
