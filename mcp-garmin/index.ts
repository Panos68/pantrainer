import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { GarminConnect } = require('garmin-connect') as any

const TOKEN_PATH = path.join(os.homedir(), '.garmin-mcp-tokens.json')

async function createClient() {
  const email = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('GARMIN_EMAIL and GARMIN_PASSWORD must be set')

  const client = new GarminConnect({ username: email, password })

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      await client.loadToken(cached.oauth1, cached.oauth2)
      return client
    } catch {
      // Token invalid — fall through to fresh login
    }
  }

  await client.login()
  const token = client.exportToken()
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token), 'utf-8')
  return client
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

const server = new Server(
  { name: 'garmin-connect', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_week_activities',
      description: 'Fetch all Garmin activities for a date range',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
    {
      name: 'get_recovery_snapshot',
      description: 'Fetch sleep duration and resting HR for each date in a range',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
    {
      name: 'get_daily_hr',
      description: 'Fetch resting HR and max HR for a specific date',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date YYYY-MM-DD' },
        },
        required: ['date'],
      },
    },
    {
      name: 'get_last_activity',
      description: 'Fetch the most recent Garmin activity',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    const client = await createClient()

    if (name === 'get_last_activity') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activities: any[] = await client.getActivities(0, 1)
      const a = activities[0]
      if (!a) return { content: [{ type: 'text', text: 'No activities found' }] }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: a.activityName,
            type: a.activityType?.typeKey,
            date: a.startTimeLocal,
            duration_min: a.duration ? Math.round(a.duration / 60) : null,
            avg_hr_bpm: a.averageHR ? Math.round(a.averageHR) : null,
            calories: a.calories ? Math.round(a.calories) : null,
          }, null, 2),
        }],
      }
    }

    if (name === 'get_week_activities') {
      const { start_date, end_date } = args as { start_date: string; end_date: string }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = await client.getActivities(0, 50)
      const filtered = all.filter((a) =>
        a.startTimeLocal >= start_date && a.startTimeLocal <= end_date + ' 23:59:59'
      )
      return {
        content: [{
          type: 'text',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          text: JSON.stringify(filtered.map((a: any) => ({
            date: a.startTimeLocal?.split(' ')[0],
            name: a.activityName,
            type: a.activityType?.typeKey,
            duration_min: a.duration ? Math.round(a.duration / 60) : null,
            avg_hr_bpm: a.averageHR ? Math.round(a.averageHR) : null,
            calories: a.calories ? Math.round(a.calories) : null,
          })), null, 2),
        }],
      }
    }

    if (name === 'get_daily_hr') {
      const { date } = args as { date: string }
      const raw = await client.getHeartRate(new Date(date + 'T12:00:00'))
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            date,
            resting_hr_bpm: raw?.restingHeartRate ?? null,
            max_hr_bpm: raw?.maxHeartRate ?? null,
          }, null, 2),
        }],
      }
    }

    if (name === 'get_recovery_snapshot') {
      const { start_date, end_date } = args as { start_date: string; end_date: string }

      const dates: string[] = []
      const cursor = new Date(start_date + 'T12:00:00')
      const end = new Date(end_date + 'T12:00:00')
      while (cursor <= end) {
        dates.push(formatDate(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }

      const results = await Promise.all(dates.map(async (date) => {
        const [sleepRes, hrRes] = await Promise.allSettled([
          client.getSleepData(new Date(date + 'T12:00:00')),
          client.getHeartRate(new Date(date + 'T12:00:00')),
        ])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dto = sleepRes.status === 'fulfilled' ? (sleepRes.value as any)?.dailySleepDTO : null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hr = hrRes.status === 'fulfilled' ? (hrRes.value as any) : null
        return {
          date,
          sleep_hours: dto ? Math.round((dto.sleepTimeSeconds / 3600) * 10) / 10 : null,
          deep_sleep_hours: dto ? Math.round((dto.deepSleepSeconds / 3600) * 10) / 10 : null,
          rem_sleep_hours: dto ? Math.round((dto.remSleepSeconds / 3600) * 10) / 10 : null,
          resting_hr_bpm: hr?.restingHeartRate ?? null,
        }
      }))

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Garmin MCP server running on stdio')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
