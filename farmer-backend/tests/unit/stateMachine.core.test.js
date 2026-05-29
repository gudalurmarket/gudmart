'use strict'

const {
  assertValidTransition,
  enforceActionAllowed,
  isActionAllowed,
  InvalidStateTransitionError
} = require('../../server/modules/stateMachine')
const { ActionNotAllowedError } = require('../../server/lib/errors')

describe('State Machine core (pure)', () => {
  describe('assertValidTransition', () => {
    it('allows valid transition setup → open', () => {
      expect(() => assertValidTransition('setup', 'open')).not.toThrow()
    })

    it('rejects skip transition setup → locked', () => {
      expect(() => assertValidTransition('setup', 'locked')).toThrow(
        InvalidStateTransitionError
      )
    })

    it('rejects backward transition open → setup', () => {
      expect(() => assertValidTransition('open', 'setup')).toThrow(
        InvalidStateTransitionError
      )
    })

    it('rejects transition from terminal closed state', () => {
      expect(() => assertValidTransition('closed', 'open')).toThrow(
        InvalidStateTransitionError
      )
    })
  })

  describe('isActionAllowed', () => {
    it('returns true when action is permitted in state', () => {
      expect(isActionAllowed('open', 'create_order')).toBe(true)
    })

    it('returns false when action is not permitted in state', () => {
      expect(isActionAllowed('locked', 'create_order')).toBe(false)
    })

    it('throws for unknown action (no silent failure)', () => {
      expect(() => isActionAllowed('open', 'fake_action')).toThrow(
        'Unknown action: fake_action'
      )
    })

    it('throws for invalid state (no silent failure)', () => {
      expect(() =>
        isActionAllowed('invalid_state', 'create_order')
      ).toThrow(InvalidStateTransitionError)
    })
  })

  describe('enforceActionAllowed', () => {
    it('passes when action is permitted', () => {
      expect(() => enforceActionAllowed('create_order', 'open')).not.toThrow()
    })

    it('throws ActionNotAllowedError when action is not permitted', () => {
      expect(() => enforceActionAllowed('create_order', 'locked')).toThrow(
        ActionNotAllowedError
      )
    })
  })
})
