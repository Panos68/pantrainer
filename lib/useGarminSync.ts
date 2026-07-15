'use client'

import { useCallback, useState } from 'react'

// Standalone extraction of the Garmin-activity-sync call used by the log page's
// `refreshFromGarmin`. This hook intentionally covers only the "activity sync"
// half (GET /api/garmin/sync) — not the recovery POST — because the live
// session's end-of-queue review screen only needs the training-effect fields
// that come back from the activity match (garmin_activity_id,
// aerobic/anaerobic training effect, training_stress_score, hr_zones), not the
// daily recovery snapshot. The log page's own `refreshFromGarmin` is left
// untouched (not migrated to this hook) to avoid any behavior risk to that
// page in this phase — see task-2 report for rationale.
export type GarminSyncResult = {
  matched: boolean
  duration_min?: number
  avg_hr_bpm?: number
  total_calories?: number
  garmin_activity_id?: number
  aerobic_training_effect?: number | null
  anaerobic_training_effect?: number | null
  training_stress_score?: number | null
  hr_zones?: Array<{ zone_name: string; secs_in_zone: number; zone_high_boundary: number }> | null
  distance_m?: number | null
  avg_speed_mps?: number | null
  activity_notes?: string | null
}

export function useGarminSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<GarminSyncResult | null>(null)

  const syncGarmin = useCallback(
    async (date: string, type: string): Promise<GarminSyncResult | null> => {
      setSyncing(true)
      try {
        const syncUrl = `/api/garmin/sync?date=${date}&type=${encodeURIComponent(type)}`
        const res = await fetch(syncUrl, { cache: 'no-store' })
        const data = res.ok ? ((await res.json()) as GarminSyncResult) : null
        const matched = data?.matched ? data : null
        setLastSync(matched)
        return matched
      } catch {
        setLastSync(null)
        return null
      } finally {
        setSyncing(false)
      }
    },
    [],
  )

  return { syncing, lastSync, syncGarmin }
}
