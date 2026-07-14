import { findBestMatch } from '@/lib/exerciseNameMatch'

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')?.trim()
  if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

  const exercises = await getExercises()
  const match = findBestMatch(exercises, name, (e) => e.exercise_name)

  return Response.json(match ?? null)
}
