import { format } from 'date-fns'
import {
  readCurrentWeek,
  readAutomationNotes,
  writeProposedPlan,
} from '@/lib/data'
import { buildExportV2 } from '@/lib/export'
import { validateImport } from '@/lib/import'
import { SessionSchema, ProposedPlanRunTypeSchema } from '@/lib/schema'

// ---------------------------------------------------------------------------
// MCP tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_current_week',
    description:
      'Fetch the current training week export (v2 coach context) plus any automation notes/rules you should follow when proposing plans.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'submit_proposed_plan',
    description:
      'Submit a proposed full-week plan. The athlete will review it in the app before applying. Provide the complete week_doc JSON as a string.',
    inputSchema: {
      type: 'object',
      properties: {
        json: {
          type: 'string',
          description: 'Full week_doc JSON string — same format as exported by get_current_week.',
        },
        source: { type: 'string', description: 'Label for the source (default: cowork).' },
        run_type: {
          type: 'string',
          enum: ['manual', 'daily', 'weekly'],
          description: 'Type of planning run.',
        },
      },
      required: ['json'],
    },
  },
  {
    name: 'submit_today_session',
    description:
      'Submit a proposed update for a single session (today by default). Merges into the current week and stores as a proposed plan for review.',
    inputSchema: {
      type: 'object',
      properties: {
        session: {
          type: 'object',
          description: 'Session object matching the SessionSchema.',
        },
        target_date: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) of the session to update. Defaults to today.',
        },
        source: { type: 'string' },
        run_type: { type: 'string', enum: ['manual', 'daily', 'weekly'] },
      },
      required: ['session'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleGetCurrentWeek() {
  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return { error: 'No current week found' }
  }
  const [payload, notes] = await Promise.all([
    buildExportV2(currentWeek),
    readAutomationNotes(),
  ])
  return { export_v2: payload, automation_notes: notes }
}

async function handleSubmitProposedPlan(args: Record<string, unknown>) {
  const json = args.json
  if (typeof json !== 'string' || json.trim().length === 0) {
    return { ok: false, error: 'Missing json' }
  }

  const result = validateImport(json)
  if (!result.ok) {
    return { ok: false, errors: result.errors }
  }

  const notes = await readAutomationNotes()
  const source = typeof args.source === 'string' ? args.source : 'cowork'
  const runTypeParsed = ProposedPlanRunTypeSchema.safeParse(args.run_type)
  const run_type = runTypeParsed.success ? runTypeParsed.data : 'manual'

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source,
    run_type,
    notes_version: notes.updated_at,
    raw_json: json,
    week_doc: result.data,
  })

  return { ok: true, source, run_type }
}

async function handleSubmitTodaySession(args: Record<string, unknown>) {
  const sessionParsed = SessionSchema.safeParse(args.session)
  if (!sessionParsed.success) {
    return {
      ok: false,
      error: 'Invalid session',
      errors: sessionParsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    }
  }

  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return { ok: false, error: 'No current week found' }
  }

  const targetDate =
    typeof args.target_date === 'string' ? args.target_date : format(new Date(), 'yyyy-MM-dd')

  const targetIndex = currentWeek.sessions.findIndex((s) => s.date === targetDate)
  if (targetIndex === -1) {
    return { ok: false, error: `No session found for ${targetDate}` }
  }

  const existing = currentWeek.sessions[targetIndex]
  if (existing.status === 'completed' || existing.status === 'skipped') {
    return { ok: false, error: `${existing.day} is already finalized` }
  }

  const normalizedSession = {
    ...sessionParsed.data,
    day: existing.day,
    date: existing.date,
    status: existing.status,
  }

  const proposedWeek = {
    ...currentWeek,
    sessions: currentWeek.sessions.map((s, i) => (i === targetIndex ? normalizedSession : s)),
  }

  const notes = await readAutomationNotes()
  const source = typeof args.source === 'string' ? args.source : 'cowork'
  const runTypeParsed = ProposedPlanRunTypeSchema.safeParse(args.run_type)
  const run_type = runTypeParsed.success ? runTypeParsed.data : 'daily'

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source,
    run_type,
    notes_version: notes.updated_at,
    raw_json: JSON.stringify(proposedWeek, null, 2),
    week_doc: proposedWeek,
  })

  return { ok: true, target_day: existing.day, target_date: existing.date, source, run_type }
}

// ---------------------------------------------------------------------------
// MCP request dispatch
// ---------------------------------------------------------------------------

type McpRequest =
  | { jsonrpc: '2.0'; id: string | number; method: 'initialize'; params: Record<string, unknown> }
  | { jsonrpc: '2.0'; id: string | number; method: 'tools/list'; params?: unknown }
  | { jsonrpc: '2.0'; id: string | number; method: 'tools/call'; params: { name: string; arguments?: Record<string, unknown> } }
  | { jsonrpc: '2.0'; id: string | number; method: string; params?: unknown }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function mcpResult(id: string | number, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result }, { headers: CORS_HEADERS })
}

function mcpError(id: string | number | null, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers: CORS_HEADERS })
}

async function dispatch(req: McpRequest): Promise<Response> {
  const { id, method } = req

  if (method === 'initialize') {
    return mcpResult(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'pantrainer', version: '1.0.0' },
    })
  }

  if (method === 'tools/list') {
    return mcpResult(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = (req as Extract<McpRequest, { method: 'tools/call' }>).params

    let data: unknown
    try {
      if (name === 'get_current_week') data = await handleGetCurrentWeek()
      else if (name === 'submit_proposed_plan') data = await handleSubmitProposedPlan(args)
      else if (name === 'submit_today_session') data = await handleSubmitTodaySession(args)
      else return mcpError(id, -32601, `Unknown tool: ${name}`)
    } catch (err) {
      return mcpError(id, -32603, err instanceof Error ? err.message : 'Internal error')
    }

    return mcpResult(id, {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    })
  }

  return mcpError(id, -32601, `Method not found: ${method}`)
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return mcpError(null, -32700, 'Parse error')
  }

  // Batch support
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((r) => dispatch(r as McpRequest)))
    const results = await Promise.all(responses.map((r) => r.json()))
    return Response.json(results, { headers: CORS_HEADERS })
  }

  return dispatch(body as McpRequest)
}

// CORS preflight
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

// Public discovery endpoint — Claude.ai probes this to confirm the server exists before OAuth.
// No auth required; returns only static metadata, no user data.
export function GET() {
  return Response.json({
    name: 'pantrainer',
    version: '1.0.0',
    description: 'PanTrainer training data access and plan submission',
    tools: TOOLS.map((t) => t.name),
  }, { headers: CORS_HEADERS })
}
