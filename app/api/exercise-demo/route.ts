interface WorkoutExercise {
  id: number
  exercise_name: string
  videoURL: string[]
  youtubeURL: string
}

let cache: WorkoutExercise[] | null = null

async function getExercises(): Promise<WorkoutExercise[]> {
  if (cache) return cache
  const res = await fetch('https://workoutapi.vercel.app/exercises', {
    next: { revalidate: 86400 },
  })
  if (!res.ok) return []
  cache = await res.json()
  return cache!
}

const EQUIPMENT = new Set(['barbell', 'dumbbell', 'dumbbells', 'kettlebell', 'cable', 'band', 'trx', 'plate', 'machine', 'smith'])

const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbells',
  bb: 'barbell',
  kb: 'kettlebell',
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
}

function coreTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !EQUIPMENT.has(t))
}

function score(exercise: WorkoutExercise, needleTokens: string[], needleCore: string[]): number {
  const hayTokens = tokenize(exercise.exercise_name)
  const hayCore = coreTokens(hayTokens)

  // Exact match
  if (hayTokens.join(' ') === needleTokens.join(' ')) return 100

  // All needle words must appear somewhere
  const allPresent = needleTokens.every((t) => hayTokens.includes(t))
  if (!allPresent) return 0

  // Core movement word matches
  const coreMatches = needleCore.filter((t) => hayCore.includes(t)).length
  if (coreMatches === 0) return 0

  // Penalise extra words in the exercise not in the needle
  const extraWords = hayTokens.filter((t) => !needleTokens.includes(t)).length

  // If needle has no equipment word, prefer barbell variants slightly
  const needleHasEquipment = needleTokens.some((t) => EQUIPMENT.has(t))
  const barbellBonus = !needleHasEquipment && hayTokens.includes('barbell') ? 1 : 0

  return (coreMatches * 4) + barbellBonus - extraWords
}

function findMatch(exercises: WorkoutExercise[], name: string): WorkoutExercise | null {
  const needleTokens = tokenize(name)
  const needleCore = coreTokens(needleTokens)

  let best: WorkoutExercise | null = null
  let bestScore = 1 // minimum threshold

  for (const ex of exercises) {
    const s = score(ex, needleTokens, needleCore)
    if (s > bestScore) {
      bestScore = s
      best = ex
    }
  }

  return best
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')?.trim()
  if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

  const exercises = await getExercises()
  const match = findMatch(exercises, name)

  return Response.json(match ?? null)
}
