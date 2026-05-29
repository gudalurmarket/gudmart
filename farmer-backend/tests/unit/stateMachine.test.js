'use strict'

const { randomUUID } = require('node:crypto')
const MarketWeek = require('../../server/models/MarketWeek')
const {
  assertValidTransition,
  InvalidStateTransitionError
} = require('../../server/modules/stateMachine')
const { validateStateTransition } = require('../../server/modules/stateMachine/stateGuard')
const { transitionWeekState } = require('../../server/modules/stateMachine/transitionExecutor')
const {
  MarketWeekNotFoundError,
  MarketWeekStateMismatchError
} = require('../../server/lib/errors')

const OPERATOR_ID = 'firebase-op-test-001'

async function createWeek ({ weekId, state = 'setup', stateHistory = [] } = {}) {
  const id = weekId ?? `week-${randomUUID()}`
  const uniqueDay = new Date(Date.now() + Math.floor(Math.random() * 86400000))
  const doc = {
    week_id: id,
    market_date: uniqueDay,
    state,
    opening_balance_cash: 0,
    opening_balance_bank: 0,
    state_history: stateHistory,
    created_at: new Date(),
    created_by: OPERATOR_ID
  }
  await MarketWeek.collection.insertOne(doc)
  return doc
}

function expectInvalidTransition (fn) {
  expect(fn).toThrow(InvalidStateTransitionError)
}

describe('State Machine module', () => {
  beforeEach(async () => {
    await MarketWeek.deleteMany({})
  })

  // ──────────────────────────────
  // 1. VALID TRANSITIONS
  // ──────────────────────────────
  describe('1. valid transitions (assertValidTransition)', () => {
    it('setup → open should pass', () => {
      expect(() => assertValidTransition('setup', 'open')).not.toThrow()
    })

    it('open → locked should pass', () => {
      expect(() => assertValidTransition('open', 'locked')).not.toThrow()
    })
  })

  // ──────────────────────────────
  // 2. INVALID TRANSITIONS
  // ──────────────────────────────
  describe('2. invalid transitions (assertValidTransition)', () => {
    it('setup → locked should throw', () => {
      expectInvalidTransition(() => assertValidTransition('setup', 'locked'))
    })

    it('open → setup should throw', () => {
      expectInvalidTransition(() => assertValidTransition('open', 'setup'))
    })
  })

  // ──────────────────────────────
  // 3. TERMINAL STATE
  // ──────────────────────────────
  describe('3. terminal state', () => {
    it('closed → open should throw TERMINAL_STATE', () => {
      try {
        validateStateTransition({ currentState: 'closed', targetState: 'open' })
        throw new Error('expected TERMINAL_STATE')
      } catch (err) {
        expect(err).toMatchObject({
          code: 'TERMINAL_STATE',
          currentState: 'closed',
          targetState: 'open'
        })
      }

      expectInvalidTransition(() => assertValidTransition('closed', 'open'))
    })
  })

  // ──────────────────────────────
  // 4. SAME STATE
  // ──────────────────────────────
  describe('4. same state', () => {
    it('open → open should throw INVALID_TRANSITION', () => {
      try {
        validateStateTransition({ currentState: 'open', targetState: 'open' })
        throw new Error('expected INVALID_TRANSITION')
      } catch (err) {
        expect(err).toMatchObject({
          code: 'INVALID_TRANSITION',
          currentState: 'open',
          targetState: 'open'
        })
      }

      try {
        assertValidTransition('open', 'open')
        throw new Error('expected InvalidStateTransitionError')
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidStateTransitionError)
        expect(err.code).toBe('INVALID_TRANSITION')
        expect(err.details.reason).toBe('self-transition not allowed')
      }
    })
  })

  // ──────────────────────────────
  // 5. UNKNOWN STATES
  // ──────────────────────────────
  describe('5. unknown states (assertValidTransition)', () => {
    it('invalid → open should throw', () => {
      expectInvalidTransition(() => assertValidTransition('invalid', 'open'))
    })

    it('open → invalid should throw', () => {
      expectInvalidTransition(() => assertValidTransition('open', 'invalid'))
    })
  })

  // ──────────────────────────────
  // 6. TRANSITION EXECUTOR
  // ──────────────────────────────
  describe('6. transition executor (transitionWeekState)', () => {
    it('updates state and appends correct state_history entry', async () => {
      const week = await createWeek({ state: 'setup' })
      const before = Date.now()

      const result = await transitionWeekState({
        weekId: week.week_id,
        fromState: 'setup',
        toState: 'open',
        operatorId: OPERATOR_ID,
        note: 'week published'
      })

      const after = Date.now()
      const persisted = await MarketWeek.findOne({ week_id: week.week_id }).lean()

      expect(result.previousState).toBe('setup')
      expect(result.newState).toBe('open')
      expect(persisted.state).toBe('open')
      expect(persisted.state_history).toHaveLength(1)

      const entry = persisted.state_history[0]
      expect(entry.from_state).toBe('setup')
      expect(entry.to_state).toBe('open')
      expect(entry.changed_by).toBe(OPERATOR_ID)
      expect(entry.note).toBe('week published')
      expect(entry.changed_at).toBeInstanceOf(Date)
      expect(entry.changed_at.getTime()).toBeGreaterThanOrEqual(before)
      expect(entry.changed_at.getTime()).toBeLessThanOrEqual(after)
    })
  })

  // ──────────────────────────────
  // 7. CAS PROTECTION
  // ──────────────────────────────
  describe('7. CAS protection', () => {
    it('throws MarketWeekStateMismatchError when fromState is wrong and leaves state unchanged', async () => {
      const week = await createWeek({ state: 'setup' })

      await expect(
        transitionWeekState({
          weekId: week.week_id,
          fromState: 'open',
          toState: 'locked',
          operatorId: OPERATOR_ID
        })
      ).rejects.toBeInstanceOf(MarketWeekStateMismatchError)

      const unchanged = await MarketWeek.findOne({ week_id: week.week_id }).lean()
      expect(unchanged.state).toBe('setup')
      expect(unchanged.state_history).toHaveLength(0)
    })
  })

  // ──────────────────────────────
  // 8. NOT FOUND
  // ──────────────────────────────
  describe('8. not found', () => {
    it('throws MarketWeekNotFoundError for non-existent weekId', async () => {
      await expect(
        transitionWeekState({
          weekId: 'week-does-not-exist',
          fromState: 'setup',
          toState: 'open',
          operatorId: OPERATOR_ID
        })
      ).rejects.toBeInstanceOf(MarketWeekNotFoundError)
    })
  })

  // ──────────────────────────────
  // 9. MULTIPLE TRANSITIONS (SEQUENCE)
  // ──────────────────────────────
  describe('9. multiple transitions (sequence)', () => {
    it('setup → open → locked → delivery with matching state_history length', async () => {
      const week = await createWeek({ state: 'setup' })
      const steps = [
        ['setup', 'open'],
        ['open', 'locked'],
        ['locked', 'delivery']
      ]

      for (const [fromState, toState] of steps) {
        await transitionWeekState({
          weekId: week.week_id,
          fromState,
          toState,
          operatorId: OPERATOR_ID
        })
      }

      const persisted = await MarketWeek.findOne({ week_id: week.week_id }).lean()
      expect(persisted.state).toBe('delivery')
      expect(persisted.state_history).toHaveLength(steps.length)

      for (let i = 0; i < steps.length; i++) {
        const [fromState, toState] = steps[i]
        expect(persisted.state_history[i]).toMatchObject({
          from_state: fromState,
          to_state: toState,
          changed_by: OPERATOR_ID
        })
        expect(persisted.state_history[i].changed_at).toBeInstanceOf(Date)
      }
    })
  })

  // ──────────────────────────────
  // Additional guards (no mocks, real DB)
  // ──────────────────────────────
  describe('transition executor — invalid transitions do not mutate DB', () => {
    it('rejects setup → locked before any write', async () => {
      const week = await createWeek({ state: 'setup' })

      await expect(
        transitionWeekState({
          weekId: week.week_id,
          fromState: 'setup',
          toState: 'locked',
          operatorId: OPERATOR_ID
        })
      ).rejects.toBeInstanceOf(InvalidStateTransitionError)

      const unchanged = await MarketWeek.findOne({ week_id: week.week_id }).lean()
      expect(unchanged.state).toBe('setup')
      expect(unchanged.state_history).toHaveLength(0)
    })
  })

  describe('concurrent transitions (CAS)', () => {
    it('allows only one winner when two identical transitions race', async () => {
      const week = await createWeek({ state: 'setup' })

      const [first, second] = await Promise.allSettled([
        transitionWeekState({
          weekId: week.week_id,
          fromState: 'setup',
          toState: 'open',
          operatorId: OPERATOR_ID
        }),
        transitionWeekState({
          weekId: week.week_id,
          fromState: 'setup',
          toState: 'open',
          operatorId: OPERATOR_ID
        })
      ])

      const fulfilled = [first, second].filter((r) => r.status === 'fulfilled')
      const rejected = [first, second].filter((r) => r.status === 'rejected')

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(MarketWeekStateMismatchError)

      const persisted = await MarketWeek.findOne({ week_id: week.week_id }).lean()
      expect(persisted.state).toBe('open')
      expect(persisted.state_history).toHaveLength(1)
    })
  })

  describe('model protection', () => {
    it('blocks direct state mutation outside transitionWeekState', async () => {
      const week = await createWeek({ state: 'setup' })

      await expect(
        MarketWeek.updateOne(
          { week_id: week.week_id },
          { $set: { state: 'open' } }
        )
      ).rejects.toThrow(/Direct state mutation forbidden/)

      const persisted = await MarketWeek.findOne({ week_id: week.week_id }).lean()
      expect(persisted.state).toBe('setup')
    })
  })
})
