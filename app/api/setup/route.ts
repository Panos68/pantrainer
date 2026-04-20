import { readAthleteProfile, writeAthleteProfile } from '@/lib/data'
import { AthleteProfileSchema } from '@/lib/schema'

export async function GET() {
  const profile = await readAthleteProfile()
  return Response.json({ complete: profile !== null })
}

export async function POST(request: Request) {
  const body = await request.json()
  const profile = AthleteProfileSchema.parse(body)
  await writeAthleteProfile(profile)
  return Response.json({ success: true })
}
