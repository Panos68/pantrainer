import crypto from 'crypto'

// Adapted from the MIT-licensed renpho-mcp-server client
// (https://github.com/StartupBros-com/renpho-mcp-server), trimmed to just
// auth + reading measurements. Renpho has no official public API — this
// talks to the same undocumented endpoint the Renpho app itself uses.
//
// Unlike Garmin's OAuth token, a Renpho session does not survive being
// persisted and reloaded across separate process invocations (confirmed:
// reusing a session loaded from another process returns zero measurements
// even though it isn't expired). So this only caches in-memory for reuse
// within a single warm serverless instance — never persisted to the DB.

const API_BASE = 'https://cloud.renpho.com'
const ENCRYPTION_SECRET = 'ed*wijdi$h6fe3ew'
const DEFAULT_PAGE_SIZE = 50

type RenphoScaleTable = { table_name: string; user_ids: string[]; count: number }

type RenphoSession = {
  token: string
  userId: string
  scaleTables: RenphoScaleTable[]
  expires_at: number
}

export type RenphoMeasurement = {
  time_stamp: number // unix seconds
  weight: number // kg
  bmi: number | null
  bodyfat: number | null
  water: number | null
  muscle: number | null
  bone: number | null
  bmr: number | null
  visceral_fat: number | null
  protein: number | null
}

function encryptAES(content: string): string {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(ENCRYPTION_SECRET, 'utf8'), null)
  let encrypted = cipher.update(content, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return encrypted
}

function encryptEmptyBytes(): string {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(ENCRYPTION_SECRET, 'utf8'), null)
  return Buffer.concat([cipher.update(Buffer.from([])), cipher.final()]).toString('base64')
}

function decryptAES(encryptedContent: string): string {
  const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(ENCRYPTION_SECRET, 'utf8'), null)
  let decrypted = decipher.update(encryptedContent, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Renpho's user/measurement IDs can exceed Number precision — pull the raw
// digit strings out of the JSON text before JSON.parse rounds them.
function extractIdAsString(json: string, key: string): string | null {
  const match = json.match(new RegExp(`"${key}":(\\d+)`))
  return match ? match[1] : null
}

function extractIdsAsStrings(json: string, key: string): string[] {
  return Array.from(json.matchAll(new RegExp(`"${key}":(\\d+)`, 'g')), (m) => m[1])
}

function extractUserIdGroupsAsStrings(json: string): string[][] {
  const matches = json.matchAll(/"userIds":\[(\d+(?:,\d+)*)\]/g)
  return Array.from(matches, (m) => m[1].split(','))
}

let inMemorySession: RenphoSession | null = null

function loadCachedSession(): RenphoSession | null {
  if (!inMemorySession || inMemorySession.expires_at <= Date.now()) return null
  return inMemorySession
}

async function postEncryptedRaw(
  path: string,
  session: { token: string; userId: string },
  requestBody: Record<string, unknown> | null,
  emptyBody = false,
): Promise<string> {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token: session.token,
      userId: session.userId,
      appVersion: '7.0.0',
      platform: 'android',
    },
    body: JSON.stringify({
      encryptData: emptyBody ? encryptEmptyBytes() : encryptAES(JSON.stringify(requestBody ?? {})),
    }),
  })

  const responseJson = (await response.json()) as { code: number; msg?: string; data?: string }
  if (responseJson.code !== 101 || !responseJson.data) {
    throw new Error(`Renpho API call failed for ${path}: code=${responseJson.code}, msg=${responseJson.msg}`)
  }
  return decryptAES(responseJson.data)
}

async function login(): Promise<RenphoSession> {
  const email = process.env.RENPHO_EMAIL
  const password = process.env.RENPHO_PASSWORD
  if (!email || !password) throw new Error('RENPHO_EMAIL and RENPHO_PASSWORD must be set')

  const loginData = {
    questionnaire: {},
    login: {
      password,
      areaCode: 'US',
      appRevision: '7.0.0',
      cellphoneType: 'pantrainer',
      systemType: '11',
      email,
      platform: 'android',
    },
    bindingList: { deviceTypes: ['2'] },
  }

  const loginResponse = await fetch(`${API_BASE}/renpho-aggregation/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptData: encryptAES(JSON.stringify(loginData)) }),
  })
  const loginJson = (await loginResponse.json()) as { code: number; msg: string; data: string }
  if (loginJson.code !== 101) throw new Error(`Renpho authentication failed: ${loginJson.msg}`)

  const rawLoginData = decryptAES(loginJson.data)
  const login_ = (JSON.parse(rawLoginData) as { login: Record<string, unknown> }).login
  const userId = extractIdAsString(rawLoginData, 'id') || String(login_.id)
  const temporarySession = { token: login_.token as string, userId }

  const rawDeviceData = await postEncryptedRaw('renpho-aggregation/device/count', temporarySession, null, true)
  const deviceData = JSON.parse(rawDeviceData) as {
    scale?: Array<{ userIds: Array<string | number>; count: number; tableName: string }>
  }
  const extractedUserIdGroups = extractUserIdGroupsAsStrings(rawDeviceData)

  const scaleTables: RenphoScaleTable[] = (deviceData.scale || []).map((scaleInfo, index) => ({
    table_name: scaleInfo.tableName,
    count: scaleInfo.count,
    user_ids: extractedUserIdGroups[index] || (scaleInfo.userIds || []).map(String),
  }))

  return {
    token: temporarySession.token,
    userId,
    scaleTables,
    expires_at: Date.now() + 50 * 60 * 1000,
  }
}

async function authenticate(): Promise<RenphoSession> {
  if (!process.env.RENPHO_EMAIL || !process.env.RENPHO_PASSWORD) {
    throw new Error('RENPHO_EMAIL and RENPHO_PASSWORD must be set')
  }

  const cached = loadCachedSession()
  if (cached) return cached

  const session = await login()
  inMemorySession = session
  return session
}

async function fetchMeasurementPage(
  session: RenphoSession,
  tableName: string,
  userIds: string[],
  pageNum: number,
  pageSize: number,
): Promise<Array<Record<string, unknown>>> {
  const rawResponse = await postEncryptedRaw('RenphoHealth/scale/queryAllMeasureDataList', session, {
    pageNum,
    pageSize,
    userIds,
    tableName,
  })

  const parsed = JSON.parse(rawResponse) as Array<Record<string, unknown>>
  const ids = extractIdsAsStrings(rawResponse, 'id')
  const boundUserIds = extractIdsAsStrings(rawResponse, 'bUserId')

  return parsed.map((entry, index) => ({
    ...entry,
    __idString: ids[index] ?? (entry.id != null ? String(entry.id) : undefined),
    __bUserIdString: boundUserIds[index] ?? (entry.bUserId != null ? String(entry.bUserId) : undefined),
  }))
}

function mapMeasurement(m: Record<string, unknown>): RenphoMeasurement & { id: string; user_id?: string } {
  return {
    id: (m.__idString as string) ?? String(m.id),
    user_id: m.__bUserIdString as string | undefined,
    time_stamp: Number(m.timeStamp),
    weight: m.weight as number,
    bmi: (m.bmi as number) ?? null,
    bodyfat: (m.bodyfat as number) ?? null,
    water: (m.water as number) ?? null,
    muscle: (m.muscle as number) ?? null,
    bone: (m.bone as number) ?? null,
    bmr: (m.bmr as number) ?? null,
    visceral_fat: (m.visfat as number) ?? null,
    protein: (m.protein as number) ?? null,
  }
}

/**
 * Most recent weight/body-composition measurements for the account owner,
 * newest first. Renpho has no date-range query — this pulls the most
 * recent `limit` readings per scale table and lets callers filter by date.
 */
export async function fetchRecentMeasurements(limit = 30): Promise<RenphoMeasurement[]> {
  try {
    const session = await authenticate()
    if (!session.scaleTables.length) return []

    // Pages are oldest-first, so the newest readings are on the *last* page —
    // fetch that one page per table rather than page 1.
    const pageSize = Math.min(DEFAULT_PAGE_SIZE * 2, Math.max(DEFAULT_PAGE_SIZE, limit))
    const rawResults = await Promise.all(
      session.scaleTables.map((table) => {
        const totalPages = Math.max(1, Math.ceil(Math.max(table.count || 0, pageSize) / pageSize))
        return fetchMeasurementPage(session, table.table_name, table.user_ids, totalPages, pageSize)
      }),
    )

    const mapped = rawResults.flat().map(mapMeasurement)
    const forOwner = mapped.filter((m) => m.user_id === session.userId)
    const selected = forOwner.length > 0 ? forOwner : mapped

    const uniqueById = new Map<string, RenphoMeasurement>()
    for (const m of selected) {
      if (!uniqueById.has(m.id)) uniqueById.set(m.id, m)
    }

    return Array.from(uniqueById.values())
      .sort((a, b) => b.time_stamp - a.time_stamp)
      .slice(0, limit)
  } catch {
    return []
  }
}
