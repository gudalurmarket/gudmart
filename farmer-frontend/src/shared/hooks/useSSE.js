import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../lib/api.js'
import { auth } from '../lib/firebase.js'
import { SSE_STATUS } from '../lib/constants.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const POLL_INTERVAL_MS = 5000

/**
 * @param {string | { weekId?: string | null, onNewMessage?: (payload: unknown) => void }} arg0
 * @param {{ weekId?: string | null, onMessage?: (payload: unknown) => void, enabled?: boolean } | undefined} legacyOptions
 * @returns {{ connectionStatus: 'connected' | 'reconnecting' | 'polling', lastHeartbeat: number | null, status: string }}
 */
export default function useSSE (arg0, legacyOptions) {
  if (typeof arg0 === 'string') {
    const opts = legacyOptions ?? {}
    return useSSEImpl({
      weekId: opts.weekId ?? null,
      onNewMessage: opts.onMessage,
      enabled: opts.enabled !== false,
    })
  }
  const canonical = arg0 ?? {}
  return useSSEImpl({
    weekId: canonical.weekId ?? null,
    onNewMessage: canonical.onNewMessage,
    enabled: true,
  })
}

function useSSEImpl ({ weekId, onNewMessage, enabled }) {
  const [connectionStatus, setConnectionStatus] = useState('reconnecting')
  const [lastHeartbeat, setLastHeartbeat] = useState(null)

  const onNewMessageRef = useRef(onNewMessage)
  const eventSourceRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const attemptsRef = useRef(0)

  useEffect(() => {
    onNewMessageRef.current = onNewMessage
  }, [onNewMessage])

  useEffect(() => {
    if (!enabled) {
      setLastHeartbeat(null)
      return undefined
    }

    let cancelled = false

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const clearPollInterval = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }

    const closeEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }

    function parsePayload (raw) {
      if (raw == null || raw === '') return null
      try {
        return JSON.parse(raw)
      } catch {
        return raw
      }
    }

    const pushPollMessages = (data) => {
      const messages = data?.messages ?? []
      for (const msg of messages) {
        onNewMessageRef.current?.(msg)
      }
    }

    const startPolling = () => {
      if (!weekId || cancelled) return
      clearPollInterval()
      setConnectionStatus(SSE_STATUS.POLLING_FALLBACK)

      const tick = async () => {
        if (cancelled || !weekId) return
        try {
          const data = await apiGet(
            `/api/v1/weeks/${weekId}/intake?queueStatus=pending`,
          )
          pushPollMessages(data)
        } catch {
          // keep polling on errors
        }
      }

      tick()
      pollIntervalRef.current = setInterval(tick, POLL_INTERVAL_MS)
    }

    const handleEventSourceError = () => {
      if (cancelled) return

      attemptsRef.current += 1
      clearReconnectTimer()
      closeEventSource()

      if (attemptsRef.current < 3) {
        setConnectionStatus('reconnecting')
        const delay = attemptsRef.current * 2000
        reconnectTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            openEventSource()
          }
        }, delay)
        return
      }

      if (weekId) {
        startPolling()
      } else {
        setConnectionStatus('reconnecting')
        reconnectTimerRef.current = setTimeout(() => {
          if (cancelled) return
          attemptsRef.current = 0
          openEventSource()
        }, POLL_INTERVAL_MS)
      }
    }

    async function openEventSource () {
      if (cancelled) return

      if (typeof EventSource === 'undefined') {
        if (weekId) {
          startPolling()
        } else {
          setConnectionStatus('reconnecting')
        }
        return
      }

      closeEventSource()

      const user = auth.currentUser
      if (!user) {
        setConnectionStatus('reconnecting')
        reconnectTimerRef.current = setTimeout(() => {
          if (!cancelled) openEventSource()
        }, POLL_INTERVAL_MS)
        return
      }

      let token
      try {
        token = await user.getIdToken()
      } catch {
        handleEventSourceError()
        return
      }

      if (cancelled) return

      const url =
        `${API_BASE_URL}/api/v1/events/intake-queue?token=${encodeURIComponent(token)}`
      const es = new EventSource(url)
      eventSourceRef.current = es

      const markConnected = () => {
        if (cancelled) return
        attemptsRef.current = 0
        setConnectionStatus('connected')
      }

      es.onopen = markConnected

      es.addEventListener('connection-established', markConnected)

      es.addEventListener('new-message', (event) => {
        if (cancelled) return
        const payload = parsePayload(event.data)
        onNewMessageRef.current?.(payload)
      })

      es.addEventListener('heartbeat', () => {
        if (cancelled) return
        setLastHeartbeat(Date.now())
      })

      es.onerror = () => {
        handleEventSourceError()
      }
    }

    attemptsRef.current = 0
    setConnectionStatus('reconnecting')
    openEventSource()

    return () => {
      cancelled = true
      clearReconnectTimer()
      clearPollInterval()
      closeEventSource()
    }
  }, [weekId, enabled])

  useEffect(() => {
    if (!enabled) {
      setConnectionStatus('reconnecting')
    }
  }, [enabled])

  const status = useMemo(() => {
    if (!enabled) {
      return SSE_STATUS.DISCONNECTED
    }
    if (connectionStatus === 'polling') {
      return SSE_STATUS.POLLING_FALLBACK
    }
    return connectionStatus
  }, [enabled, connectionStatus])

  return { connectionStatus, lastHeartbeat, status }
}
