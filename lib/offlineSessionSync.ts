// Offline safety net for the live workout. Each PATCH to /api/session/[day]
// carries the session's full exercises array, so the latest body is the whole
// truth: when the network is down we keep one merged pending body per day in
// localStorage and replay it once the connection is back.

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type SessionPatch = Record<string, unknown>

const keyFor = (day: string) => `pending-session-patch:${day}`

export function readPending(store: KeyValueStore, day: string): SessionPatch | null {
  try {
    const raw = store.getItem(keyFor(day))
    return raw ? (JSON.parse(raw) as SessionPatch) : null
  } catch {
    return null
  }
}

// Later writes win field by field (e.g. a completion body adds status/rpe on
// top of the last exercises update).
export function mergePending(store: KeyValueStore, day: string, patch: SessionPatch): SessionPatch {
  const merged = { ...(readPending(store, day) ?? {}), ...patch }
  try {
    store.setItem(keyFor(day), JSON.stringify(merged))
  } catch {
    // Storage full/blocked: nothing more we can do offline.
  }
  return merged
}

export function clearPending(store: KeyValueStore, day: string): void {
  try {
    store.removeItem(keyFor(day))
  } catch {
    // ignore
  }
}

export type PatchResult = { ok: boolean; offline: boolean; response?: Response }

// Sends the patch; on a network failure stores it for later instead of losing
// it. A server error (4xx/5xx) is returned as-is — that isn't an offline case.
export async function patchSession(
  store: KeyValueStore,
  day: string,
  patch: SessionPatch,
  send: (body: SessionPatch) => Promise<Response>,
): Promise<PatchResult> {
  const pending = readPending(store, day)
  const body = pending ? { ...pending, ...patch } : patch
  try {
    const response = await send(body)
    if (response.ok) clearPending(store, day)
    return { ok: response.ok, offline: false, response }
  } catch {
    mergePending(store, day, patch)
    return { ok: false, offline: true }
  }
}

export async function flushPending(
  store: KeyValueStore,
  day: string,
  send: (body: SessionPatch) => Promise<Response>,
): Promise<boolean> {
  const pending = readPending(store, day)
  if (!pending) return true
  try {
    const response = await send(pending)
    if (response.ok) clearPending(store, day)
    return response.ok
  } catch {
    return false
  }
}
