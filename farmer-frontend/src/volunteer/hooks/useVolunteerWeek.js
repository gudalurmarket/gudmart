import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../shared/lib/api.js'
import { pickWeekByState } from '../../shared/lib/activeWeek.js'
import { apiErrorTranslationKey, resolveWeekId } from '../../shared/lib/apiErrors.js'
import {
  subscribeActiveWeekChanged,
} from '../../shared/hooks/useWeekState.js'

/**
 * Resolves the active market week for volunteer screens (filtered by state).
 *
 * @param {string} requiredState — e.g. WEEK_STATES.DELIVERY or MARKET_DAY
 */
export default function useVolunteerWeek (requiredState) {
  const [week, setWeek] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState(null)

  const fetchWeek = useCallback(async () => {
    setLoading(true)
    setErrorKey(null)
    try {
      const data = await apiGet(`/api/v1/weeks?state=${encodeURIComponent(requiredState)}`)
      const active = pickWeekByState(data.weeks ?? [], requiredState)
      if (!active) {
        setWeek(null)
        return
      }
      const weekId = resolveWeekId(active)
      setWeek(weekId ? { ...active, weekId } : active)
    } catch (err) {
      setErrorKey(apiErrorTranslationKey(err))
      setWeek(null)
    } finally {
      setLoading(false)
    }
  }, [requiredState])

  useEffect(() => {
    fetchWeek()
  }, [fetchWeek])

  useEffect(() => {
    return subscribeActiveWeekChanged(fetchWeek)
  }, [fetchWeek])

  const weekId = resolveWeekId(week)

  return {
    week,
    weekId,
    state: week?.state ?? null,
    loading,
    errorKey,
    refetch: fetchWeek,
  }
}
