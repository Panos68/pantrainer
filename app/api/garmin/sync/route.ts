import { fetchActivitiesForDate, fetchActivityDetail, type GarminActivityRaw } from '@/lib/garmin'

const STRENGTH_TYPES = new Set([
  'strength_training', 'weight_training', 'gym_and_fitness_equipment', 'fitness_equipment',
])
const CONDITIONING_TYPES = new Set([
  'cardio', 'hiit', 'running', 'cycling', 'swimming', 'workout', 'training', 'indoor_cardio',
])
const RECOVERY_TYPES = new Set([
  'yoga', 'flexibility', 'stretching', 'breathing', 'mindfulness',
])
const WALK_TYPES = new Set([
  'walking', 'casual_walking', 'speed_walking',
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
  } else if (sessionType === 'Recovery') {
    const filtered = activities.filter((a) => RECOVERY_TYPES.has(a.activityType?.typeKey))
    if (filtered.length) candidates = filtered
  }

  // Pick the longest activity by duration
  return candidates.reduce((best, a) => (a.duration > best.duration ? a : best), candidates[0])
}

function formatActivityNote(a: GarminActivityRaw): string {
  const name = a.activityName ?? a.activityType?.typeKey ?? 'Activity'
  const parts: string[] = []
  if (a.duration) parts.push(`${Math.round(a.duration / 60)} min`)
  if (a.averageHR) parts.push(`${Math.round(a.averageHR)} bpm`)
  if (a.calories) parts.push(`${Math.round(a.calories)} kcal`)
  if (a.distance && a.distance > 0) {
    const km = (a.distance / 1000).toFixed(2)
    let distStr = `${km}km`
    if (a.averageSpeed && a.averageSpeed > 0) {
      const paceSecPerKm = 1000 / a.averageSpeed
      const paceMin = Math.floor(paceSecPerKm / 60)
      const paceSec = Math.round(paceSecPerKm % 60).toString().padStart(2, '0')
      distStr += ` @ ${paceMin}:${paceSec}/km`
    }
    parts.push(distStr)
  }
  return `Garmin: ${name}${parts.length ? ' — ' + parts.join(', ') : ''}`
}

function aggregateActivities(activities: GarminActivityRaw[]) {
  const totalDurationSec = activities.reduce((s, a) => s + (a.duration ?? 0), 0)
  const totalCalories = activities.reduce((s, a) => s + (a.calories ?? 0), 0)

  // Weighted average HR by duration
  let weightedHrSum = 0
  let weightedHrDuration = 0
  for (const a of activities) {
    if (a.averageHR != null && a.averageHR > 0 && a.duration != null && a.duration > 0) {
      weightedHrSum += a.averageHR * a.duration
      weightedHrDuration += a.duration
    }
  }
  const avgHr = weightedHrDuration > 0 ? Math.round(weightedHrSum / weightedHrDuration) : null

  const notes = activities.map(formatActivityNote).join('\n')

  // Primary = longest activity (for training effect / TSS / activity_id)
  const primary = activities.reduce((best, a) => (a.duration > best.duration ? a : best), activities[0])

  return {
    totalDurationMin: totalDurationSec > 0 ? Math.round(totalDurationSec / 60) : null,
    totalCalories: totalCalories > 0 ? Math.round(totalCalories) : null,
    avgHr,
    notes,
    primary,
  }
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
    const { activities, client } = await fetchActivitiesForDate(date)

    // Exclude walks
    const trainable = activities.filter((a) => !WALK_TYPES.has(a.activityType?.typeKey))

    if (!trainable.length) {
      return Response.json({ matched: false })
    }

    if (trainable.length === 1) {
      const best = trainable[0]
      const detail = await fetchActivityDetail(best.activityId, client)
      return Response.json({
        matched: true,
        garmin_activity_id: best.activityId,
        duration_min: best.duration ? Math.round(best.duration / 60) : null,
        avg_hr_bpm: best.averageHR ? Math.round(best.averageHR) : null,
        total_calories: best.calories ? Math.round(best.calories) : null,
        activity_name: best.activityName,
        activity_type: best.activityType?.typeKey,
        distance_m: best.distance ?? null,
        avg_speed_mps: best.averageSpeed ?? null,
        aerobic_training_effect: best.aerobicTrainingEffect ?? null,
        anaerobic_training_effect: best.anaerobicTrainingEffect ?? null,
        training_stress_score: best.trainingStressScore ?? null,
        hr_zones: detail.hrZones,
        activity_notes: null,
      })
    }

    // Multiple activities — aggregate
    const { totalDurationMin, totalCalories, avgHr, notes, primary } = aggregateActivities(trainable)
    const detail = await fetchActivityDetail(primary.activityId, client)

    return Response.json({
      matched: true,
      garmin_activity_id: primary.activityId,
      duration_min: totalDurationMin,
      avg_hr_bpm: avgHr,
      total_calories: totalCalories,
      activity_name: primary.activityName,
      activity_type: primary.activityType?.typeKey,
      distance_m: null,
      avg_speed_mps: null,
      aerobic_training_effect: primary.aerobicTrainingEffect ?? null,
      anaerobic_training_effect: primary.anaerobicTrainingEffect ?? null,
      training_stress_score: primary.trainingStressScore ?? null,
      hr_zones: detail.hrZones,
      activity_notes: notes,
    })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return Response.json({ matched: false, reason: 'Garmin fetch failed' })
  }
}
