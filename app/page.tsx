import { redirect } from 'next/navigation'
import { readAthleteProfile } from '@/lib/data'

export default function Home() {
  const profile = readAthleteProfile()
  if (!profile) redirect('/setup')

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <h1 className="text-4xl font-bold">PanTrainer</h1>
      <p className="text-zinc-400 mt-2">
        Welcome back, {profile.name}. Loading your training data...
      </p>
    </main>
  )
}
