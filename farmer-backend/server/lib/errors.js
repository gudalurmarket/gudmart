'use strict'

/**
 * Centralized named error classes and Fastify error handler.
 * All API errors serialize to { code, httpStatus, message, details }.
 */

class AppError extends Error {
  constructor (code, httpStatus, message, details = {}) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.httpStatus = httpStatus
    // Fastify lifecycle hooks use statusCode when no custom handler runs first
    this.statusCode = httpStatus
    this.message = message
    this.details = details
    Error.captureStackTrace?.(this, this.constructor)
  }
}

class WalletInsufficientError extends AppError {
  constructor (message, details = {}) {
    super('WALLET_INSUFFICIENT', 422, message, details)
  }
}

class WalletValidationError extends AppError {
  constructor (message, details = {}) {
    super('WALLET_VALIDATION', 400, message, details)
  }
}

class WalletDuplicateOperationError extends AppError {
  constructor (message, details = {}) {
    super('WALLET_DUPLICATE_OPERATION', 409, message, details)
  }
}

class WalletTransactionNotFoundError extends AppError {
  constructor (message, details = {}) {
    super('WALLET_TXN_NOT_FOUND', 404, message, details)
  }
}

class WalletDuplicateReversalError extends AppError {
  constructor (message, details = {}) {
    super('WALLET_DUPLICATE_REVERSAL', 409, message, details)
  }
}

class CustomerNotFoundError extends AppError {
  constructor (message, details = {}) {
    super('CUSTOMER_NOT_FOUND', 404, message, details)
  }
}

class FarmerNotFoundError extends AppError {
  constructor (message, details = {}) {
    super('FARMER_NOT_FOUND', 404, message, details)
  }
}

class MarketWeekNotFoundError extends AppError {
  constructor (message, details = {}) {
    super('MARKET_WEEK_NOT_FOUND', 404, message, details)
  }
}

class MarketWeekStateMismatchError extends AppError {
  constructor (message, details = {}) {
    super('MARKET_WEEK_STATE_MISMATCH', 409, message, details)
  }
}

class ActionNotAllowedError extends AppError {
  constructor (message, details = {}) {
    super('ACTION_NOT_PERMITTED_IN_STATE', 409, message, details)
  }
}

class TransitionGateBlocked extends AppError {
  constructor (message, details = {}) {
    super('TRANSITION_GATE_FAILED', 409, message, details)
  }
}

class InvalidStateTransitionError extends AppError {
  constructor (message, details = {}) {
    super('INVALID_TRANSITION', 409, message, details)
  }
}

class DuplicateMessageError extends AppError {
  constructor (message, details = {}) {
    super('DUPLICATE_MESSAGE', 409, message, details)
  }
}

class DuplicatePhoneError extends AppError {
  constructor (message, details = {}) {
    super('DUPLICATE_PHONE', 409, message, details)
  }
}

class OrderNotFoundError extends AppError {
  constructor (message, details = {}) {
    super('ORDER_NOT_FOUND', 404, message, details)
  }
}

function serializeAppError (error) {
  return {
    code: error.code,
    httpStatus: error.httpStatus,
    message: error.message,
    details: error.details ?? {}
  }
}

function registerErrorHandler (fastify) {
  fastify.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.httpStatus).send(serializeAppError(err))
    }

    if (err.validation) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
        message: err.message,
        details: { fields: err.validation }
      })
    }

    console.error('[UNHANDLED ERROR]', err)
    request.log.error(err)
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      httpStatus: 500,
      message: 'An unexpected error occurred',
      details: {}
    })
  })
}

module.exports = {
  AppError,
  WalletInsufficientError,
  WalletValidationError,
  WalletDuplicateOperationError,
  WalletTransactionNotFoundError,
  WalletDuplicateReversalError,
  CustomerNotFoundError,
  FarmerNotFoundError,
  MarketWeekNotFoundError,
  MarketWeekStateMismatchError,
  ActionNotAllowedError,
  TransitionGateBlocked,
  InvalidStateTransitionError,
  DuplicateMessageError,
  DuplicatePhoneError,
  OrderNotFoundError,
  registerErrorHandler
}
