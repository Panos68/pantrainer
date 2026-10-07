import { randomBytes } from 'crypto'
import { getDb } from './mongodb'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  BEARER_KINDS,
  REFRESH_TOKEN_TTL_SECONDS,
  generateToken,
  hashToken,
  isTokenUsable,
  shouldTouchLastUsed,
  type ApiTokenDoc,
} from './api-tokens'

export type OAuthTokenResponse = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
}

export type TokenListing = {
  personal: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }>
  grants: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null; active: boolean }>
}

async function tokens() {
  return (await getDb()).collection<ApiTokenDoc>('api_tokens')
}

function plusSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString()
}

export async function createPersonalToken(name: string): Promise<{ token: string; id: string }> {
  const token = generateToken()
  const id = hashToken(token)
  await (await tokens()).insertOne({
    _id: id, kind: 'personal', name, grantId: null,
    createdAt: new Date().toISOString(), lastUsedAt: null, expiresAt: null, revokedAt: null,
  })
  return { token, id }
}

export async function issueOAuthGrant(clientName: string, grantId = randomBytes(12).toString('hex')): Promise<OAuthTokenResponse> {
  const now = new Date()
  const access = generateToken()
  const refresh = generateToken()
  const base = { name: clientName, grantId, createdAt: now.toISOString(), lastUsedAt: null, revokedAt: null }
  await (await tokens()).insertMany([
    { ...base, _id: hashToken(access), kind: 'oauth_access', expiresAt: plusSeconds(now, ACCESS_TOKEN_TTL_SECONDS) },
    { ...base, _id: hashToken(refresh), kind: 'oauth_refresh', expiresAt: plusSeconds(now, REFRESH_TOKEN_TTL_SECONDS) },
  ])
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refresh }
}

// Atomically claims the refresh token (revokedAt: null → now) so two concurrent
// refreshes can't both succeed, then revokes the rest of the grant and issues a
// fresh pair under the same grantId.
export async function rotateRefreshToken(raw: string): Promise<OAuthTokenResponse | null> {
  const now = new Date()
  const col = await tokens()
  const claimed = await col.findOneAndUpdate(
    { _id: hashToken(raw), kind: 'oauth_refresh', revokedAt: null },
    { $set: { revokedAt: now.toISOString() } },
    { returnDocument: 'before' },
  )
  if (!claimed || !isTokenUsable(claimed, now, ['oauth_refresh']) || !claimed.grantId) return null
  await col.updateMany({ grantId: claimed.grantId, revokedAt: null }, { $set: { revokedAt: now.toISOString() } })
  return issueOAuthGrant(claimed.name, claimed.grantId)
}

export async function findUsableBearerToken(raw: string): Promise<ApiTokenDoc | null> {
  const now = new Date()
  const col = await tokens()
  const doc = await col.findOne({ _id: hashToken(raw) })
  if (!doc || !isTokenUsable(doc, now, BEARER_KINDS)) return null
  if (shouldTouchLastUsed(doc, now)) {
    await col.updateOne({ _id: doc._id }, { $set: { lastUsedAt: now.toISOString() } })
  }
  return doc
}

export async function revokeTokenOrGrant(id: string): Promise<boolean> {
  const col = await tokens()
  const doc = await col.findOne({ _id: id })
  if (!doc) return false
  const revokedAt = new Date().toISOString()
  if (doc.grantId) await col.updateMany({ grantId: doc.grantId, revokedAt: null }, { $set: { revokedAt } })
  else await col.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt } })
  return true
}

export async function listTokens(): Promise<TokenListing> {
  const now = new Date()
  const docs = await (await tokens()).find({}).sort({ createdAt: -1 }).toArray()
  const personal = docs
    .filter((d) => d.kind === 'personal')
    .map((d) => ({ id: d._id, name: d.name, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt, revokedAt: d.revokedAt }))
  const byGrant = new Map<string, ApiTokenDoc[]>()
  for (const d of docs) {
    if (d.kind === 'personal' || !d.grantId) continue
    byGrant.set(d.grantId, [...(byGrant.get(d.grantId) ?? []), d])
  }
  const grants = [...byGrant.values()].map((group) => {
    const lastUsed = group.map((d) => d.lastUsedAt).filter((v): v is string => !!v).sort().at(-1) ?? null
    const oldest = group.map((d) => d.createdAt).sort()[0]
    return {
      id: group[0]._id,
      name: group[0].name,
      createdAt: oldest,
      lastUsedAt: lastUsed,
      active: group.some((d) => isTokenUsable(d, now, ['oauth_access', 'oauth_refresh'])),
    }
  })
  return { personal, grants }
}
