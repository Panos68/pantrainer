import { NextRequest } from 'next/server'
import { readCurrentWeek, readAppState, writeAppState } from '@/lib/data'
import { pushSessionToNotion } from '@/lib/notion'

// POST /api/notion/push-session
// Body: { day: "Monday" }
export async function POST(req: NextRequest) {
  const { day } = await req.json()
  if (!day) return Response.json({ error: 'day is required' }, { status: 400 })

  const week = readCurrentWeek()
  if (!week) return Response.json({ error: 'No active week' }, { status: 400 })

  const session = week.sessions.find((s) => s.day === day)
  if (!session) return Response.json({ error: `No session found for ${day}` }, { status: 404 })

  const result = await pushSessionToNotion(session, week.week)

  if (result.error) return Response.json({ error: result.error }, { status: 500 })

  const state = readAppState()
  writeAppState({ ...state, notionLastSync: new Date().toISOString() })

  return Response.json({ pushed: result.pushed })
}
