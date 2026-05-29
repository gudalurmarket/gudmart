export const WEEK_STATES = {
  SETUP: 'setup',
  OPEN: 'open',
  LOCKED: 'locked',
  DELIVERY: 'delivery',
  MARKET_DAY: 'market_day',
  RECONCILIATION: 'reconciliation',
  CLOSED: 'closed',
}

export const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  PACKED: 'packed',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
}

export const UNIT_TYPES = {
  KG: 'kg',
  PIECE: 'piece',
  BUNCH: 'bunch',
  GRAMS: '100g',
}

export const PAYMENT_CHANNELS = {
  CASH: 'cash',
  UPI: 'upi',
  SYSTEM: 'system',
}

export const FARMER_TYPES = {
  OUTSTATION: 'outstation',
  LOCAL: 'local',
}

export const FARMER_PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
}

export const WALLET_TX_TYPES = {
  TOP_UP: 'top_up',
  ORDER_DEBIT: 'order_debit',
  ORDER_DEBIT_REVERSAL: 'order_debit_reversal',
  PRICE_DIFF_CREDIT: 'price_diff_credit',
  PRICE_DIFF_DEBIT: 'price_diff_debit',
  CUSTOMER_DUE: 'customer_due',
  BALANCE_PAYMENT: 'balance_payment',
  MANUAL_ADJUSTMENT: 'manual_adjustment',
}

export const PARSE_STATUS = {
  CLEAN: 'clean',
  PARTIAL: 'partial',
  MANUAL_REQUIRED: 'manual_required',
  VOICE_NOTE: 'voice_note',
  IMAGE: 'image',
  NO_ACTIVE_WEEK: 'no_active_week',
  UNKNOWN_SENDER: 'unknown_sender',
}

export const ROLES = {
  OPERATOR: 'operator',
  VOLUNTEER: 'volunteer',
}

export const SSE_STATUS = {
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  POLLING_FALLBACK: 'polling_fallback',
  DISCONNECTED: 'disconnected',
}

export const STATE_BADGE_CLASS = {
  setup: 'badge-setup',
  open: 'badge-open',
  locked: 'badge-locked',
  delivery: 'badge-delivery',
  market_day: 'badge-market-day',
  reconciliation: 'badge-reconciliation',
  closed: 'badge-closed',
}
