import { format, parseISO } from 'date-fns'
import { readCurrentWeek } from '@/lib/data'
import { buildExportV2 } from '@/lib/export'
import { buildExportBundleResponse } from '@/lib/export-bundle'
import { fetchActivitiesForDate, fetchActivityDetail } from '@/lib/garmin'

async function enrichSessionWithGarmin(session: { date: string; type: string }) {
  try {
    const { activities, client } = await fetchActivitiesForDate(session.date)
    if (!activities.length) return null

    const STRENGTH_TYPES = new Set(['strength_training', 'weight_training', 'gym_and_fitness_equipment', 'fitness_equipment'])
    const CONDITIONING_TYPES = new Set(['cardio', 'hiit', 'running', 'cycling', 'swimming', 'workout', 'training', 'indoor_cardio'])

    let candidates = activities
    if (session.type === 'Strength') {
      const filtered = activities.filter((a) => STRENGTH_TYPES.has(a.activityType?.typeKey))
      if (filtered.length) candidates = filtered
    } else if (session.type === 'Conditioning') {
      const filtered = activities.filter((a) => CONDITIONING_TYPES.has(a.activityType?.typeKey))
      if (filtered.length) candidates = filtered
    }

    const best = candidates.reduce((b, a) => (a.duration > b.duration ? a : b), candidates[0])
    const detail = await fetchActivityDetail(best.activityId, client)

    return {
      garmin_activity_id: best.activityId,
      aerobic_training_effect: best.aerobicTrainingEffect ?? null,
      anaerobic_training_effect: best.anaerobicTrainingEffect ?? null,
      training_stress_score: best.trainingStressScore ?? null,
      hr_zones: detail.hrZones ?? null,
    }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const includeDeload = searchParams.get('includeDeload') === '1'
  const payload = await buildExportV2(currentWeek, { includeDeload })

  // Enrich completed sessions missing Garmin data — read-only, doesn't modify stored data
  if (process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD) {
    const enrichments = await Promise.allSettled(
      payload.sessions
        .filter((s) => s.status === 'completed' && !s.garmin_activity_id)
        .map(async (s) => ({ date: s.date, data: await enrichSessionWithGarmin(s) }))
    )

    for (const result of enrichments) {
      if (result.status !== 'fulfilled' || !result.value.data) continue
      const { date, data } = result.value
      const session = payload.sessions.find((s) => s.date === date)
      if (!session) continue
      session.garmin_activity_id = data.garmin_activity_id
      if (session.aerobic_training_effect == null) session.aerobic_training_effect = data.aerobic_training_effect
      if (session.anaerobic_training_effect == null) session.anaerobic_training_effect = data.anaerobic_training_effect
      if (session.training_stress_score == null) session.training_stress_score = data.training_stress_score
      if (session.hr_zones == null) session.hr_zones = data.hr_zones
    }
  }

  let filename: string
  if (currentWeek.sessions && currentWeek.sessions.length > 0) {
    const sorted = [...currentWeek.sessions].sort((a, b) => a.date.localeCompare(b.date))
    filename = `week-${format(parseISO(sorted[0].date), 'yyyy-ww')}-v2.json`
  } else {
    filename = `week-${format(new Date(), 'yyyy-ww')}-v2.json`
  }

  const includePhotos = searchParams.get('includePhotos') === '1'
  if (includePhotos) {
    return buildExportBundleResponse(payload, filename)
  }

  const json = JSON.stringify(payload, null, 2)
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
