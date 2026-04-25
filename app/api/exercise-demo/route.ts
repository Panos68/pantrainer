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

function findMatch(exercises: WorkoutExercise[], name: string): WorkoutExercise | null {
  const needle = name.toLowerCase()
  const exact = exercises.find((e) => e.exercise_name.toLowerCase() === needle)
  if (exact) return exact
  const words = needle.split(/\s+/)
  return exercises.find((e) => {
    const hay = e.exercise_name.toLowerCase()
    return words.every((w) => hay.includes(w))
  }) ?? null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')?.trim()
  if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

  const exercises = await getExercises()
  const match = findMatch(exercises, name)

  return Response.json(match ?? null)
}
