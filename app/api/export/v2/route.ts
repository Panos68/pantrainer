import { format, parseISO } from 'date-fns'
import { readCurrentWeek } from '@/lib/data'
import { buildExportV2 } from '@/lib/export'
import { buildExportBundleResponse } from '@/lib/export-bundle'

export async function POST(request: Request) {
  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return Response.json({ error: 'No current week found' }, { status: 404 })
  }

  const payload = await buildExportV2(currentWeek)

  let filename: string
  if (currentWeek.sessions && currentWeek.sessions.length > 0) {
    const sorted = [...currentWeek.sessions].sort((a, b) => a.date.localeCompare(b.date))
    filename = `week-${format(parseISO(sorted[0].date), 'yyyy-ww')}-v2.json`
  } else {
    filename = `week-${format(new Date(), 'yyyy-ww')}-v2.json`
  }

  const { searchParams } = new URL(request.url)
  const includePhotos = searchParams.get('includePhotos') === '1'
  if (includePhotos) {
    return buildExportBundleResponse(payload, filename)
  }

  const json = JSON.stringify(payload, null, 2)
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
