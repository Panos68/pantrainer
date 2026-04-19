import { readAppState, writeAppState } from '@/lib/data'
import { AppStateSchema } from '@/lib/schema'
import type { AppState } from '@/lib/schema'

// GET — returns current AppState
export async function GET() {
  const state = readAppState()
  return Response.json(state)
}

// PATCH — accepts partial AppState, merges and saves
export async function PATCH(request: Request) {
  const body = await request.json()
  const state = readAppState()

  // Merge updates with existing state
  const updates = body as Partial<AppState>
  const merged = { ...state, ...updates }

  // Validate merged state
  const validated = AppStateSchema.parse(merged)

  // Write to file
  writeAppState(validated)

  return Response.json(validated)
}
