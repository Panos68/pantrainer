export type AuthRole = 'owner' | 'food'

export type AuthSession = {
  role: AuthRole
  issuedAt: number
  expiresAt: number
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(padded)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return mismatch === 0
}

function sessionSecret(): string | null {
  return process.env.AUTH_SESSION_SECRET || null
}

export async function createSession(role: AuthRole, now = Date.now()): Promise<string> {
  const secret = sessionSecret()
  if (!secret) throw new Error('AUTH_SESSION_SECRET is not configured')

  const payload = toBase64Url(encoder.encode(JSON.stringify({
    role,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  } satisfies AuthSession)))
  return `${payload}.${toBase64Url(await hmac(payload, secret))}`
}

export async function parseSession(value: string | undefined, now = Date.now()): Promise<AuthSession | null> {
  const secret = sessionSecret()
  if (!value || !secret) return null

  const dot = value.indexOf('.')
  if (dot === -1) return null
  const payload = value.slice(0, dot)
  const signature = value.slice(dot + 1)
  const expected = toBase64Url(await hmac(payload, secret))
  if (!equal(signature, expected)) return null

  const decoded = fromBase64Url(payload)
  if (!decoded) return null
  try {
    const parsed = JSON.parse(decoder.decode(decoded)) as Partial<AuthSession>
    if ((parsed.role !== 'owner' && parsed.role !== 'food') || typeof parsed.issuedAt !== 'number' || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) {
      return null
    }
    return parsed as AuthSession
  } catch {
    return null
  }
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  const cookies = request.headers.get('cookie') ?? ''
  const value = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith('auth='))?.slice(5)
  return parseSession(value)
}

export async function roleForPassword(password: unknown): Promise<AuthRole | null> {
  if (typeof password !== 'string') return null
  const ownerPassword = process.env.AUTH_PASSWORD
  const foodPassword = process.env.FOOD_ACCESS_PASSWORD
  if (ownerPassword && equal(password, ownerPassword)) return 'owner'
  if (foodPassword && equal(password, foodPassword)) return 'food'
  return null
}

export function isFoodPath(pathname: string): boolean {
  return pathname === '/food' || pathname.startsWith('/food/') || pathname === '/api/food' || pathname.startsWith('/api/food/') || pathname === '/api/auth/logout'
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export async function isAutomationToken(request: Request): Promise<boolean> {
  const token = process.env.AUTOMATION_API_TOKEN
  const authorization = request.headers.get('authorization')
  return Boolean(token && authorization && equal(authorization, `Bearer ${token}`))
}

export const authCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: '/',
}
