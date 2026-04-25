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

function tokenize(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
}

function coreTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !EQUIPMENT.has(t))
}

function score(exercise: WorkoutExercise, needleTokens: string[], needleCore: string[]): number {
  const hayTokens = tokenize(exercise.exercise_name)
  const hayCore = coreTokens(hayTokens)

  // Exact match
  if (hayTokens.join(' ') === needleTokens.join(' ')) return 100

  // Count how many needle words appear in the exercise name
  const fullMatches = needleTokens.filter((t) => hayTokens.includes(t)).length
  const coreMatches = needleCore.filter((t) => hayCore.includes(t)).length

  // Penalise if the exercise has many extra words not in the needle
  const extraWords = hayTokens.filter((t) => !needleTokens.includes(t)).length

  return (coreMatches * 3) + fullMatches - extraWords
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
