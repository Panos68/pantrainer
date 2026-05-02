import { head } from '@vercel/blob'
import { format } from 'date-fns'
import { signPhotoUrl } from '@/app/api/photos/route'
import {
  readCurrentWeek,
  readAutomationNotes,
  readProposedPlan,
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
      'Fetch the current training week export (v2 coach context), automation notes/rules, and the latest proposed plan draft (if any).',
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
          description: 'Either full week_doc JSON or { "week_doc": ..., "analysis_text": "..." }.',
        },
        source: { type: 'string', description: 'Label for the source (default: cowork).' },
        run_type: {
          type: 'string',
          enum: ['manual', 'daily', 'weekly'],
          description: 'Type of planning run.',
        },
        analysis_text: {
          type: 'string',
          description: 'Optional plain-text week analysis written by Claude for the athlete.',
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
        analysis_text: { type: 'string' },
      },
      required: ['session'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

// Note: base64 embedding was previously reverted due to SSE polling causing 83 GB-Hrs in 2 days.
// The SSE polling is now fixed (GET returns 405), so base64 is safe to use again.
async function fetchPhotoAsBase64(pathname: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) return null
    const blob = await head(pathname, { token })
    const res = await fetch(blob.url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const mimeType = contentType.split(';')[0].trim()
    const buffer = await res.arrayBuffer()
    const data = Buffer.from(buffer).toString('base64')
    return { data, mimeType }
  } catch {
    return null
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pantrainer.vercel.app'

async function handleGetCurrentWeek() {
  const currentWeek = await readCurrentWeek()
  if (!currentWeek) {
    return { error: 'No current week found' }
  }
  const [payload, notes, proposed] = await Promise.all([
    buildExportV2(currentWeek),
    readAutomationNotes(),
    readProposedPlan(),
  ])

  const photoPathnames: string[] = payload.photos_to_attach ?? []
  const photoUrls = photoPathnames.map((p) => signPhotoUrl(APP_URL, p))
  const photoBase64 = await Promise.all(photoPathnames.map((p) => fetchPhotoAsBase64(p)))

  return {
    export_v2: payload,
    automation_notes: notes,
    proposed_plan: proposed
      ? {
          created_at: proposed.created_at,
          source: proposed.source,
          run_type: proposed.run_type,
          notes_version: proposed.notes_version,
          analysis_text: proposed.analysis_text,
          week_doc: proposed.week_doc,
        }
      : null,
    photoUrls,
    photoBase64: photoBase64.filter((p): p is { data: string; mimeType: string } => p !== null),
  }
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
  const analysis_text =
    typeof args.analysis_text === 'string'
      ? args.analysis_text
      : result.analysis_text

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source,
    run_type,
    notes_version: notes.updated_at,
    analysis_text,
    raw_json: json,
    week_doc: result.data,
  })

  return { ok: true, source, run_type, analysis_text }
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
  const analysis_text = typeof args.analysis_text === 'string' ? args.analysis_text : null

  await writeProposedPlan({
    created_at: new Date().toISOString(),
    source,
    run_type,
    notes_version: notes.updated_at,
    analysis_text,
    raw_json: JSON.stringify(proposedWeek, null, 2),
    week_doc: proposedWeek,
  })

  return {
    ok: true,
    target_day: existing.day,
    target_date: existing.date,
    source,
    run_type,
    analysis_text,
  }
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
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

function mcpResult(id: string | number, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result }, { headers: CORS_HEADERS })
}

function mcpError(id: string | number | null, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers: CORS_HEADERS })
}

async function dispatch(req: McpRequest): Promise<Response> {
  // Notifications have no id — return 202 Accepted with no body
  if (!('id' in req) || req.id === undefined || req.id === null) {
    return new Response(null, { status: 202, headers: CORS_HEADERS })
  }

  const { id, method } = req

  if (method === 'initialize') {
    const sessionId = crypto.randomUUID()
    const body = {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'pantrainer', version: '1.0.0' },
    }
    return Response.json(
      { jsonrpc: '2.0', id, result: body },
      { headers: { ...CORS_HEADERS, 'Mcp-Session-Id': sessionId } },
    )
  }

  if (method === 'tools/list') {
    return mcpResult(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = (req as Extract<McpRequest, { method: 'tools/call' }>).params

    try {
      if (name === 'get_current_week') {
        const result = await handleGetCurrentWeek()
        if ('error' in result) {
          return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
        }
        const { photoUrls, photoBase64, ...rest } = result
        const payload = photoUrls.length > 0 ? { ...rest, photo_urls: photoUrls } : rest
        const content: unknown[] = [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
        for (const photo of photoBase64) {
          content.push({ type: 'image', data: photo.data, mimeType: photo.mimeType })
        }
        return mcpResult(id, { content })
      }

      let data: unknown
      if (name === 'submit_proposed_plan') data = await handleSubmitProposedPlan(args)
      else if (name === 'submit_today_session') data = await handleSubmitTodaySession(args)
      else return mcpError(id, -32601, `Unknown tool: ${name}`)
      return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
    } catch (err) {
      return mcpError(id, -32603, err instanceof Error ? err.message : 'Internal error')
    }
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

// GET/SSE not supported — this server never pushes server-initiated messages.
// Returning 405 tells Claude.ai to use POST-only mode and stops continuous SSE polling.
export function GET() {
  return new Response(null, { status: 405, headers: CORS_HEADERS })
}
