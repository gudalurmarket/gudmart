import { Receipt } from 'lucide-react'
import { PAYMENT_CHANNELS, WALLET_TX_TYPES } from '../../shared/lib/constants.js'
import { formatINR } from '../../shared/lib/paise.js'

export const CREDIT_TX_TYPES = new Set([
  WALLET_TX_TYPES.TOP_UP,
  WALLET_TX_TYPES.ORDER_DEBIT_REVERSAL,
  WALLET_TX_TYPES.PRICE_DIFF_CREDIT,
  WALLET_TX_TYPES.BALANCE_PAYMENT,
])

export const TXN_TYPE_LABEL_KEYS = {
  [WALLET_TX_TYPES.TOP_UP]: 'txn.type.top_up',
  [WALLET_TX_TYPES.ORDER_DEBIT]: 'txn.type.order_debit',
  [WALLET_TX_TYPES.ORDER_DEBIT_REVERSAL]: 'txn.type.order_debit_reversal',
  [WALLET_TX_TYPES.PRICE_DIFF_CREDIT]: 'txn.type.price_diff_credit',
  [WALLET_TX_TYPES.PRICE_DIFF_DEBIT]: 'txn.type.price_diff_debit',
  [WALLET_TX_TYPES.CUSTOMER_DUE]: 'txn.type.customer_due',
  [WALLET_TX_TYPES.BALANCE_PAYMENT]: 'txn.type.balance_payment',
  [WALLET_TX_TYPES.MANUAL_ADJUSTMENT]: 'txn.type.manual_adjustment',
}

export const CHANNEL_LABEL_KEYS = {
  [PAYMENT_CHANNELS.CASH]: 'channel.cash',
  [PAYMENT_CHANNELS.UPI]: 'channel.upi',
  [PAYMENT_CHANNELS.SYSTEM]: 'channel.system',
}

const CHANNEL_BADGE_CLASS = {
  [PAYMENT_CHANNELS.CASH]: 'bg-[--color-surface-raised] text-[--color-text-secondary]',
  [PAYMENT_CHANNELS.UPI]: 'bg-[--color-info-light] text-[--color-info]',
  [PAYMENT_CHANNELS.SYSTEM]: 'bg-[--color-surface-raised] text-[--color-text-secondary]',
}

export function formatLedgerDateTime (isoString, lang) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function isCreditTransaction (txn, chronologicallyOlderTxn) {
  if (txn.type === WALLET_TX_TYPES.MANUAL_ADJUSTMENT) {
    if (
      chronologicallyOlderTxn
      && typeof chronologicallyOlderTxn.runningBalance === 'number'
      && typeof txn.runningBalance === 'number'
    ) {
      return txn.runningBalance > chronologicallyOlderTxn.runningBalance
    }
    if (typeof txn.runningBalance === 'number' && typeof txn.amount === 'number') {
      return txn.runningBalance >= txn.amount
    }
    return true
  }
  return CREDIT_TX_TYPES.has(txn.type)
}

export function LedgerRow ({ txn, olderTxn, t, lang }) {
  const credit = isCreditTransaction(txn, olderTxn)
  const typeKey = TXN_TYPE_LABEL_KEYS[txn.type]
  const typeLabel = typeKey ? t(typeKey) : txn.type
  const channelKey = txn.channel ? CHANNEL_LABEL_KEYS[txn.channel] : null
  const amountPaise = typeof txn.amount === 'number' ? txn.amount : 0
  const runningBalance = txn.runningBalance ?? txn.running_balance

  return (
    <div className="mb-2 rounded-xl border border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[--color-text-primary]">{typeLabel}</p>
          {channelKey && (
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_BADGE_CLASS[txn.channel] ?? 'bg-[--color-surface-raised] text-[--color-text-secondary]'}`}
            >
              {t(channelKey)}
            </span>
          )}
          {(txn.referenceNote ?? txn.reference_note) && (
            <p className="mt-1 text-xs text-[--color-text-secondary]">
              {txn.referenceNote ?? txn.reference_note}
            </p>
          )}
          <p className="mt-1 text-xs text-[--color-text-disabled]">
            {formatLedgerDateTime(txn.createdAt ?? txn.created_at, lang)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-semibold ${credit ? 'text-[--color-primary]' : 'text-[--color-error]'}`}
          >
            {credit ? '+' : '−'}
            {formatINR(amountPaise)}
          </p>
          {typeof runningBalance === 'number' && (
            <p className="mt-0.5 text-xs text-[--color-text-secondary]">
              {t('wallet.ledger.running_balance')}
              {': '}
              {formatINR(runningBalance)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function WalletLedgerSection ({ transactions, t, lang }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-[--color-text-primary]">
        {t('wallet.ledger.title')}
      </h2>
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Receipt size={28} strokeWidth={1.5} className="text-[--color-text-disabled]" />
          <p className="mt-2 text-sm text-[--color-text-secondary]">{t('wallet.ledger.empty')}</p>
        </div>
      ) : (
        transactions.map((txn, index) => (
          <LedgerRow
            key={txn.txnId ?? txn.txn_id ?? `${txn.createdAt ?? txn.created_at}-${index}`}
            txn={txn}
            olderTxn={transactions[index + 1]}
            t={t}
            lang={lang}
          />
        ))
      )}
    </section>
  )
}
