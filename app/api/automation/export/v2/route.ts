import { readCurrentWeek, readAutomationNotes } from '@/lib/data'
import { buildExportV2 } from '@/lib/export'
import { isAutomationAuthorized, requireAutomationToken } from '@/lib/automation-auth'

export async function GET(request: Request) {
  const tokenCheck = requireAutomationToken()
  if (!tokenCheck.ok) return tokenCheck.response

  if (!isAutomationAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  const [payload, notes] = await Promise.all([
    buildExportV2(currentWeek),
    readAutomationNotes(),
  ])

  return Response.json({
    export_v2: payload,
    automation_notes: notes,
  })
}
