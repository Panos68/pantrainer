import fs from 'fs'
import path from 'path'
import { format, parseISO } from 'date-fns'
import { readCurrentWeek } from '@/lib/data'
import { buildExport } from '@/lib/export'

// POST /api/export
// Builds export payload from current week
// Returns the JSON as a downloadable response with Content-Disposition: attachment
// filename: week-YYYY-WW.json (based on first session date or current week)
// Also saves the file to exports/week-YYYY-WW.json
export async function POST() {
  const currentWeek = readCurrentWeek()
  if (!currentWeek) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  const payload = buildExport(currentWeek)

  // Derive filename from first session date or current date
  let filename: string
  if (currentWeek.sessions && currentWeek.sessions.length > 0) {
    const sorted = [...currentWeek.sessions].sort((a, b) => a.date.localeCompare(b.date))
    filename = `week-${format(parseISO(sorted[0].date), 'yyyy-ww')}.json`
  } else {
    filename = `week-${format(new Date(), 'yyyy-ww')}.json`
  }

  // Save to exports/
  const exportsDir = path.join(process.cwd(), 'exports')
  fs.mkdirSync(exportsDir, { recursive: true })
  fs.writeFileSync(path.join(exportsDir, filename), JSON.stringify(payload, null, 2))

  // Return as downloadable JSON
  const json = JSON.stringify(payload, null, 2)
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
