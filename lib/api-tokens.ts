import { createHash, randomBytes } from 'crypto'

// Tokens are only ever stored as sha256 hashes. The raw value is shown to the
// owner once (personal tokens) or handed to the OAuth client, never persisted.
export type ApiTokenKind = 'personal' | 'oauth_access' | 'oauth_refresh'

export interface ApiTokenDoc {
  _id: string // sha256(raw) hex
  kind: ApiTokenKind
  name: string
  grantId: string | null // links an OAuth access/refresh pair
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

export const TOKEN_PREFIX = 'pt_'
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60
export const LAST_USED_THROTTLE_MS = 10 * 60 * 1000

// Kinds accepted in an Authorization: Bearer header. Refresh tokens only work
// at the token endpoint.
export const BEARER_KINDS: readonly ApiTokenKind[] = ['personal', 'oauth_access']

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function isTokenUsable(doc: ApiTokenDoc, now: Date, accept: readonly ApiTokenKind[]): boolean {
  if (!accept.includes(doc.kind)) return false
  if (doc.revokedAt) return false
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= now.getTime()) return false
  return true
}

export function shouldTouchLastUsed(doc: ApiTokenDoc, now: Date): boolean {
  if (!doc.lastUsedAt) return true
  return now.getTime() - new Date(doc.lastUsedAt).getTime() >= LAST_USED_THROTTLE_MS
}
