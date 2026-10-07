import { readAutomationNotes, writeAutomationNotes } from '@/lib/data'
import { AutomationNotesSchema } from '@/lib/schema'
import { requireOwnerOrBearer } from '@/lib/automation-auth'

export async function GET(request: Request) {
  const denied = await requireOwnerOrBearer(request)
  if (denied) return denied
  const notes = await readAutomationNotes()
  return Response.json(notes)
}

export async function PATCH(request: Request) {
  const denied = await requireOwnerOrBearer(request)
  if (denied) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const current = await readAutomationNotes()
  const merged = {
    ...current,
    ...(typeof body === 'object' && body !== null ? body : {}),
    updated_at: new Date().toISOString(),
  }
  const result = AutomationNotesSchema.safeParse(merged)
  if (!result.success) {
    return Response.json(
      { error: 'Invalid notes data', issues: result.error.issues },
      { status: 422 },
    )
  }

  await writeAutomationNotes(result.data)
  return Response.json(result.data)
}
