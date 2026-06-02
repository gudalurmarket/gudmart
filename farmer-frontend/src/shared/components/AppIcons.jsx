import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChevronRight,
  ChevronsRight,
  Circle,
  ClipboardList,
  Clock,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  Leaf,
  Moon,
  Package,
  PackageCheck,
  Plus,
  Radio,
  Send,
  Sprout,
  Store,
  Sun,
  Truck,
  UserRound,
  UserX,
  Wallet,
  Wifi,
  X,
} from 'lucide-react'

export const ICON_STROKE = 1.5

export function AppLogo ({ size = 20, className = '' }) {
  return <Leaf size={size} strokeWidth={ICON_STROKE} className={className} aria-hidden="true" />
}

export function StatIconContainer ({ variant, children, className = '' }) {
  const variantClass = {
    confirmed: 'bg-[--color-primary-light] text-[--color-primary]',
    pending: 'bg-[--color-warning-light] text-[--color-warning]',
    produce: 'bg-[--color-primary-light] text-[--color-primary]',
    wallets: 'bg-[--color-surface-raised] text-[--color-text-secondary]',
  }[variant]

  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${variantClass} ${className}`}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

export function StatIconConfirmed () {
  return (
    <StatIconContainer variant="confirmed">
      <CheckCircle size={20} strokeWidth={ICON_STROKE} />
    </StatIconContainer>
  )
}

export function StatIconPending () {
  return (
    <StatIconContainer variant="pending">
      <Clock size={20} strokeWidth={ICON_STROKE} />
    </StatIconContainer>
  )
}

export function StatIconProduce () {
  return (
    <StatIconContainer variant="produce">
      <Sprout size={20} strokeWidth={ICON_STROKE} />
    </StatIconContainer>
  )
}

export function StatIconWallets () {
  return (
    <StatIconContainer variant="wallets">
      <Wallet size={20} strokeWidth={ICON_STROKE} />
    </StatIconContainer>
  )
}

const NAV_ICON_MAP = {
  '/operator/dashboard': LayoutDashboard,
  '/operator/intake': Inbox,
  '/operator/orders': Package,
  '/operator/wallet': Wallet,
  '/operator/delivery': Truck,
  '/operator/market-day': Store,
  '/operator/reconciliation': ClipboardList,
  '/operator/summary': BarChart3,
  '/operator/registrations': UserRound,
  '/volunteer/delivery': Truck,
  '/volunteer/packing': Package,
  '/volunteer/dispatch': Send,
}

export function NavIcon ({ to, size = 18, className = '' }) {
  const Icon = NAV_ICON_MAP[to] ?? Circle
  return <Icon size={size} strokeWidth={ICON_STROKE} className={className} aria-hidden="true" />
}

export function LineItemRowIcon ({ unmatched }) {
  const Icon = unmatched ? AlertCircle : Circle
  const colorClass = unmatched ? 'text-[--color-warning]' : 'text-[--color-text-secondary]'
  return <Icon size={16} strokeWidth={ICON_STROKE} className={`shrink-0 ${colorClass}`} aria-hidden="true" />
}

export function ThemeIcons ({ isDark, size = 16, className = '' }) {
  const Icon = isDark ? Sun : Moon
  return <Icon size={size} strokeWidth={ICON_STROKE} className={className} aria-hidden="true" />
}

export function SseStatusIcons ({ connected, className = '' }) {
  if (connected) {
    return <Wifi size={14} strokeWidth={ICON_STROKE} className={`text-[--color-primary] ${className}`} aria-hidden="true" />
  }
  return <Radio size={14} strokeWidth={ICON_STROKE} className={`text-[--color-warning] ${className}`} aria-hidden="true" />
}

export {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  ChevronsRight,
  Circle,
  ClipboardList,
  Clock,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  Leaf,
  Package,
  PackageCheck,
  Plus,
  Radio,
  Sprout,
  UserX,
  Wallet,
  Wifi,
  X,
}
