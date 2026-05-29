import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/api.js'
import { pickActiveWeek } from '../lib/activeWeek.js'
import { resolveWeekId } from '../lib/apiErrors.js'

export default function useWeekState () {
  const [week, setWeek] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchActiveWeek = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet('/api/v1/weeks')
      const weeks = data.weeks ?? []
      const active = pickActiveWeek(weeks)
      if (!active) {
        setWeek(null)
        return
      }
      const weekId = resolveWeekId(active)
      setWeek(weekId ? { ...active, weekId } : active)
    } catch (err) {
      setError(err)
      setWeek(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActiveWeek()
  }, [fetchActiveWeek])

  return {
    week,
    state: week?.state ?? null,
    loading,
    error,
    refetch: fetchActiveWeek,
  }
}
