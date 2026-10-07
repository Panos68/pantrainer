import { getDb } from './mongodb'
import { LOGIN_WINDOW_MS, nextFailure, type AttemptState } from './rate-limit'

type AttemptDoc = AttemptState & { _id: string; expireAt: Date }

let indexEnsured = false

async function attempts() {
  const col = (await getDb()).collection<AttemptDoc>('login_attempts')
  if (!indexEnsured) {
    // Mongo's TTL monitor removes stale counters; idempotent if it already exists.
    await col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
    indexEnsured = true
  }
  return col
}

export async function getAttemptState(ip: string): Promise<AttemptState | null> {
  const doc = await (await attempts()).findOne({ _id: ip })
  return doc ? { failures: doc.failures, windowStart: doc.windowStart } : null
}

export async function recordFailure(ip: string): Promise<void> {
  const now = new Date()
  const next = nextFailure(await getAttemptState(ip), now)
  const expireAt = new Date(new Date(next.windowStart).getTime() + LOGIN_WINDOW_MS)
  await (await attempts()).updateOne({ _id: ip }, { $set: { ...next, expireAt } }, { upsert: true })
}

export async function clearAttempts(ip: string): Promise<void> {
  await (await attempts()).deleteOne({ _id: ip })
}
