import { Client } from '@notionhq/client'
import type { WeekDoc, Session } from './schema'

function getNotionClient(): Client | null {
  if (!process.env.NOTION_TOKEN) return null
  return new Client({ auth: process.env.NOTION_TOKEN })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sessionToNotionProperties(session: Session, weekLabel: string): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: Record<string, any> = {
    Day: {
      title: [{ text: { content: session.day } }],
    },
    Date: {
      date: { start: session.date },
    },
    Type: {
      select: { name: session.type },
    },
    Status: {
      select: { name: session.status },
    },
    Week: {
      rich_text: [{ text: { content: weekLabel } }],
    },
    Subtype: {
      rich_text: session.subtype ? [{ text: { content: session.subtype } }] : [],
    },
    Notes: {
      rich_text: session.notes ? [{ text: { content: session.notes } }] : [],
    },
  }

  if (session.duration_min != null) {
    props.Duration = { number: session.duration_min }
  }

  if (session.avg_hr_bpm != null) {
    props['Avg HR'] = { number: session.avg_hr_bpm }
  }

  if (session.total_calories != null) {
    props.Calories = { number: session.total_calories }
  }

  return props
}

async function queryWeekPages(
  notion: Client,
  databaseId: string,
  weekLabel: string
) {
  // The SDK v5 renamed databases.query → dataSources.query with data_source_id
  return notion.dataSources.query({
    data_source_id: databaseId,
    filter: {
      property: 'Week',
      rich_text: { equals: weekLabel },
    },
  })
}

// Push: create or update 7 Notion pages for the current week
export async function pushWeekToNotion(
  week: WeekDoc
): Promise<{ pushed: number; error?: string }> {
  const notion = getNotionClient()
  if (!notion) return { pushed: 0, error: 'Notion not configured' }

  const databaseId = process.env.NOTION_DATABASE_ID
  if (!databaseId) return { pushed: 0, error: 'NOTION_DATABASE_ID not configured' }

  try {
    // Query for existing pages with this week's label
    const existing = await queryWeekPages(notion, databaseId, week.week)

    // Build a map of day -> page_id for existing pages
    const existingByDay: Record<string, string> = {}
    for (const page of existing.results) {
      if (page.object !== 'page') continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = page as any
      const dayName = p.properties?.['Day']?.title?.[0]?.plain_text
      if (dayName) existingByDay[dayName] = p.id
    }

    let pushed = 0

    for (const session of week.sessions) {
      const properties = sessionToNotionProperties(session, week.week)
      const existingId = existingByDay[session.day]

      if (existingId) {
        await notion.pages.update({
          page_id: existingId,
          properties,
        })
      } else {
        await notion.pages.create({
          parent: { database_id: databaseId, type: 'database_id' },
          properties,
        })
      }
      pushed++
    }

    return { pushed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { pushed: 0, error: `Notion error: ${message}` }
  }
}

// Pull: read Notion pages for this week, merge non-null values back
export async function pullWeekFromNotion(
  week: WeekDoc
): Promise<{ sessions: WeekDoc['sessions']; pulled: number; error?: string }> {
  const notion = getNotionClient()
  if (!notion) return { sessions: week.sessions, pulled: 0, error: 'Notion not configured' }

  const databaseId = process.env.NOTION_DATABASE_ID
  if (!databaseId)
    return { sessions: week.sessions, pulled: 0, error: 'NOTION_DATABASE_ID not configured' }

  try {
    const existing = await queryWeekPages(notion, databaseId, week.week)

    // Build a map of day -> notion page properties
    const notionByDay: Record<string, Record<string, unknown>> = {}
    for (const page of existing.results) {
      if (page.object !== 'page') continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = page as any
      const dayName = p.properties?.['Day']?.title?.[0]?.plain_text
      if (dayName) notionByDay[dayName] = p.properties
    }

    let pulled = 0
    const updatedSessions = week.sessions.map((session) => {
      // Only update sessions that are planned or in_progress
      if (session.status === 'completed' || session.status === 'skipped') return session

      const notionProps = notionByDay[session.day]
      if (!notionProps) return session

      const updated = { ...session }
      let changed = false

      // Status
      const statusProp = notionProps['Status'] as { select?: { name?: string } } | undefined
      const notionStatus = statusProp?.select?.name
      if (
        notionStatus &&
        ['planned', 'in_progress', 'completed', 'skipped'].includes(notionStatus)
      ) {
        updated.status = notionStatus as Session['status']
        changed = true
      }

      // Duration
      const durationProp = notionProps['Duration'] as { number?: number | null } | undefined
      if (durationProp?.number != null) {
        updated.duration_min = durationProp.number
        changed = true
      }

      // Avg HR
      const hrProp = notionProps['Avg HR'] as { number?: number | null } | undefined
      if (hrProp?.number != null) {
        updated.avg_hr_bpm = hrProp.number
        changed = true
      }

      // Calories
      const calProp = notionProps['Calories'] as { number?: number | null } | undefined
      if (calProp?.number != null) {
        updated.total_calories = calProp.number
        changed = true
      }

      // Notes
      const notesProp = notionProps['Notes'] as
        | { rich_text?: Array<{ plain_text: string }> }
        | undefined
      const notesText = notesProp?.rich_text?.[0]?.plain_text
      if (notesText) {
        updated.notes = notesText
        changed = true
      }

      if (changed) pulled++
      return updated
    })

    return { sessions: updatedSessions, pulled }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { sessions: week.sessions, pulled: 0, error: `Notion error: ${message}` }
  }
}
