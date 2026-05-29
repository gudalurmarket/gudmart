import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { flushQueue } from '../lib/deliverySync'
import { apiPatch } from '../../shared/lib/api'
import useWeekState from '../../shared/hooks/useWeekState'

export function useVolunteerSW () {
  const { week } = useWeekState()
  const weekId = week?.weekId ?? week?._id

  const { needRefresh: [needsRefresh], updateServiceWorker: updateSW } =
    useRegisterSW({
      onRegistered (r) {
        console.log('[SW] Volunteer service worker registered', r)
      },
      onRegisterError (error) {
        console.error('[SW] Volunteer service worker registration failed', error)
      },
    })

  useEffect(() => {
    if (!weekId) return
    const handleOnline = async () => {
      await flushQueue(weekId, apiPatch)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [weekId])

  return { needsRefresh, updateSW }
}
