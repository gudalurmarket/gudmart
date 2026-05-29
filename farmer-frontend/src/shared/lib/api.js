import { getAuth } from 'firebase/auth'
import './firebase.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  constructor (code, httpStatus, message, details = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
    this.message = message
    this.details = details
  }
}

export class WalletInsufficientError extends ApiError {}
export class ActionNotPermittedError extends ApiError {}
export class DuplicateMessageError extends ApiError {}
export class UnknownSenderError extends ApiError {}
export class NotFoundError extends ApiError {}
export class DuplicatePhoneError extends ApiError {}
export class WalletDuplicateOperationError extends ApiError {}
export class ForbiddenError extends ApiError {}
export class UnauthorisedError extends ApiError {}
export class NetworkError extends ApiError {}

export class TransitionGateBlockedError extends ApiError {
  constructor (code, httpStatus, message, details = {}) {
    super(code, httpStatus, message, details)
    this.name = 'TransitionGateBlockedError'
    this.blockers = details.blockers ?? []
  }
}

const ERROR_CODE_MAP = {
  WALLET_INSUFFICIENT: WalletInsufficientError,
  ACTION_NOT_PERMITTED_IN_STATE: ActionNotPermittedError,
  TRANSITION_GATE_BLOCKED: TransitionGateBlockedError,
  TRANSITION_GATE_FAILED: TransitionGateBlockedError,
  DUPLICATE_MESSAGE: DuplicateMessageError,
  UNKNOWN_SENDER: UnknownSenderError,
  WEEK_NOT_FOUND: NotFoundError,
  MARKET_WEEK_NOT_FOUND: NotFoundError,
  ORDER_NOT_FOUND: NotFoundError,
  CUSTOMER_NOT_FOUND: NotFoundError,
  DUPLICATE_PHONE: DuplicatePhoneError,
  WALLET_DUPLICATE_OPERATION: WalletDuplicateOperationError,
  FORBIDDEN: ForbiddenError,
  UNAUTHORISED: UnauthorisedError,
}

function mapApiError (code, httpStatus, message, details) {
  const ErrorClass = ERROR_CODE_MAP[code] ?? ApiError
  return new ErrorClass(code, httpStatus, message, details)
}

export async function apiFetch (path, options = {}) {
  let token
  try {
    token = await getAuth().currentUser?.getIdToken()
  } catch {
    throw new NetworkError('NETWORK_ERROR', 0, 'Network error', {})
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${API_BASE_URL}${path}`
  let response
  try {
    response = await fetch(url, { ...options, headers })
  } catch {
    throw new NetworkError('NETWORK_ERROR', 0, 'Network error', {})
  }

  if (!response.ok) {
    try {
      const body = await response.json()
      const code = body.code ?? 'UNKNOWN'
      const message = body.message ?? response.statusText
      const details = body.details ?? {}
      throw mapApiError(
        code,
        body.httpStatus ?? body.statusCode ?? response.status,
        message,
        details,
      )
    } catch (err) {
      if (err instanceof ApiError) {
        throw err
      }
      throw new NetworkError('NETWORK_ERROR', 0, 'Network error', {})
    }
  }

  try {
    return await response.json()
  } catch {
    throw new NetworkError('NETWORK_ERROR', 0, 'Network error', {})
  }
}

export const apiGet = (path, options) => apiFetch(path, { ...options, method: 'GET' })
export const apiPost = (path, body, options) =>
  apiFetch(path, { ...options, method: 'POST', body: JSON.stringify(body) })
export const apiPatch = (path, body, options) =>
  apiFetch(path, { ...options, method: 'PATCH', body: JSON.stringify(body) })
export const apiDelete = (path, options) => apiFetch(path, { ...options, method: 'DELETE' })
