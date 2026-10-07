import { readAllSessions } from '@/lib/data'
import { buildStrengthSummary } from '@/lib/strength-summary'

export const dynamic = 'force-dynamic'

// Records, next-session suggestions and balance ratios for the log and live
// pages (PR badges, "next target" hints).
export async function GET() {
  const summary = buildStrengthSummary(await readAllSessions())
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}
