import fs from 'fs'
import path from 'path'
import { readAthleteProfile, writeAthleteProfile } from '@/lib/data'
import { AthleteProfileSchema } from '@/lib/schema'

export async function GET() {
  const profile = readAthleteProfile()
  return Response.json({ complete: profile !== null })
}

export async function POST(request: Request) {
  const body = await request.json()
  const profile = AthleteProfileSchema.parse(body)
  writeAthleteProfile(profile)

  // Also save lift_progression if present
  const liftProgression = body.lift_progression
  if (liftProgression && typeof liftProgression === 'object') {
    const liftPath = path.join(process.cwd(), 'data', 'lift-progression.json')
    fs.writeFileSync(liftPath, JSON.stringify(liftProgression, null, 2))
  }

  return Response.json({ success: true })
}
