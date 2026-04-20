import { fetchActivitiesForDate, fetchActivityDetail, type GarminActivityRaw } from '@/lib/garmin'

const STRENGTH_TYPES = new Set([
  'strength_training', 'weight_training', 'gym_and_fitness_equipment', 'fitness_equipment',
])
const CONDITIONING_TYPES = new Set([
  'cardio', 'hiit', 'running', 'cycling', 'swimming', 'workout', 'training',
])

function pickBestActivity(
  activities: GarminActivityRaw[],
  sessionType: string,
): GarminActivityRaw | null {
  if (!activities.length) return null

  let candidates = activities
  if (sessionType === 'Strength') {
    const filtered = activities.filter((a) => STRENGTH_TYPES.has(a.activityType?.typeKey))
    if (filtered.length) candidates = filtered
  } else if (sessionType === 'Conditioning') {
    const filtered = activities.filter((a) => CONDITIONING_TYPES.has(a.activityType?.typeKey))
    if (filtered.length) candidates = filtered
  }

  // Pick the longest activity by duration
  return candidates.reduce((best, a) => (a.duration > best.duration ? a : best), candidates[0])
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const sessionType = searchParams.get('type') ?? ''

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid or missing date' }, { status: 400 })
  }

  if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
    return Response.json({ matched: false, reason: 'Garmin credentials not configured' })
  }

  try {
    const activities = await fetchActivitiesForDate(date)
    const best = pickBestActivity(activities, sessionType)

    if (!best) {
      return Response.json({ matched: false })
    }

    const detail = await fetchActivityDetail(best.activityId)

    return Response.json({
      matched: true,
      garmin_activity_id: best.activityId,
      duration_min: best.duration ? Math.round(best.duration / 60) : null,
      avg_hr_bpm: best.averageHR ? Math.round(best.averageHR) : null,
      total_calories: best.calories ? Math.round(best.calories) : null,
      activity_name: best.activityName,
      activity_type: best.activityType?.typeKey,
      aerobic_training_effect: best.aerobicTrainingEffect ?? null,
      anaerobic_training_effect: best.anaerobicTrainingEffect ?? null,
      training_stress_score: best.trainingStressScore ?? null,
      hr_zones: detail.hrZones,
      all_activities: activities.length > 1
        ? activities.map((a) => ({
            garmin_activity_id: a.activityId,
            activity_name: a.activityName,
            activity_type: a.activityType?.typeKey,
            duration_min: a.duration ? Math.round(a.duration / 60) : null,
            avg_hr_bpm: a.averageHR ? Math.round(a.averageHR) : null,
            total_calories: a.calories ? Math.round(a.calories) : null,
            aerobic_training_effect: a.aerobicTrainingEffect ?? null,
            anaerobic_training_effect: a.anaerobicTrainingEffect ?? null,
            training_stress_score: a.trainingStressScore ?? null,
          }))
        : undefined,
    })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return Response.json({ matched: false, reason: 'Garmin fetch failed' })
  }
}
