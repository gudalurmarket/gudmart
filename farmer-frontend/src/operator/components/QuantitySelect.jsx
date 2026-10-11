import { UNIT_TYPES } from '../../shared/lib/constants.js'

/**
 * Quantity choices per unit. Decimals only where they make sense:
 *   kg     → quarter-kg steps (0.25, 0.5, 0.75, 1 …), whole kg beyond 5
 *   100g   → half steps (0.5 = 50 g), whole units beyond 5
 *   piece / bunch → whole numbers
 * No unit chosen yet → the kg list, so a decimal is never blocked.
 *
 * @param {string} unit
 * @returns {number[]}
 */
export function quantityOptionsForUnit (unit) {
  const range = (from, to, step) => {
    const out = []
    for (let i = 0; from + i * step <= to + 1e-9; i += 1) out.push(from + i * step)
    return out
  }
  if (unit === UNIT_TYPES.PIECE || unit === UNIT_TYPES.BUNCH) return range(1, 30, 1)
  if (unit === UNIT_TYPES.GRAMS) return [...range(0.5, 5, 0.5), ...range(6, 20, 1)]
  return [...range(0.25, 5, 0.25), ...range(6, 25, 1)]
}

/**
 * Dropdown replacement for a free-typed quantity field. `value` and `onChange`
 * use strings, matching the existing form state. A value that is not in the
 * list (e.g. the parser read "2.3" from a message) is kept as an extra choice
 * so it is never silently changed.
 */
export default function QuantitySelect ({ value, unit, onChange, className, ariaLabel }) {
  const options = quantityOptionsForUnit(unit)
  const current = value === '' || value == null ? null : Number(value)
  const extra = current != null && Number.isFinite(current) && !options.some((o) => Math.abs(o - current) < 1e-9)
    ? current
    : null
  const all = extra == null ? options : [...options, extra].sort((a, b) => a - b)

  return (
    <select
      value={current == null ? '' : String(all.find((o) => Math.abs(o - current) < 1e-9) ?? current)}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label={ariaLabel}
    >
      <option value="">—</option>
      {all.map((o) => (
        <option key={o} value={String(o)}>{String(o)}</option>
      ))}
    </select>
  )
}
