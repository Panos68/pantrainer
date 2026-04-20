import { readAppState, writeAppState } from '@/lib/data'
import { AppStateSchema } from '@/lib/schema'
import type { AppState } from '@/lib/schema'

export async function GET() {
  const state = await readAppState()
  return Response.json(state)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const state = await readAppState()
  const updates = body as Partial<AppState>
  const merged = { ...state, ...updates }
  const validated = AppStateSchema.parse(merged)
  await writeAppState(validated)
  return Response.json(validated)
}
