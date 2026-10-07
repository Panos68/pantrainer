import { del as blobDel, list as blobList, put as blobPut } from '@vercel/blob'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { blobUrl } from './blob-url'

// Photo storage behind one small interface, so the app runs on Vercel (Blob)
// or self-hosted with Docker (a local folder) without touching the routes.
//   BLOB_READ_WRITE_TOKEN set → Vercel Blob (private store)
//   else STORAGE_DIR set      → files under that directory
//   else                      → not configured (photo features disabled)

export interface StoredObject {
  pathname: string
  uploadedAt: Date
  size: number
}

export interface ObjectStorage {
  readonly kind: 'vercel-blob' | 'local'
  put(pathname: string, body: Buffer | Blob, contentType: string): Promise<void>
  get(pathname: string): Promise<{ body: ArrayBuffer; contentType: string } | null>
  list(prefix: string): Promise<StoredObject[]>
  del(pathnames: string[]): Promise<void>
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
}

export function contentTypeFor(pathname: string): string {
  return CONTENT_TYPES[path.extname(pathname).toLowerCase()] ?? 'application/octet-stream'
}

// Storage keys are app-generated ("data/food-photos/2026-10-07/123-x.jpg"),
// but reads take them from query strings — never let one escape the root.
export function isSafeKey(pathname: string): boolean {
  if (!pathname || pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) return false
  return pathname.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

function vercelBlobStorage(token: string): ObjectStorage {
  return {
    kind: 'vercel-blob',
    async put(pathname, body, contentType) {
      await blobPut(pathname, body, { access: 'private', addRandomSuffix: false, contentType, token })
    },
    async get(pathname) {
      const res = await fetch(blobUrl(pathname), { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Blob read failed (${res.status})`)
      return { body: await res.arrayBuffer(), contentType: res.headers.get('Content-Type') ?? contentTypeFor(pathname) }
    },
    async list(prefix) {
      const out: StoredObject[] = []
      let cursor: string | undefined
      do {
        const page = await blobList({ prefix, cursor, token })
        out.push(...page.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt), size: b.size })))
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
      return out
    },
    async del(pathnames) {
      if (pathnames.length > 0) await blobDel(pathnames, { token })
    },
  }
}

export function localStorageDriver(root: string): ObjectStorage {
  const resolve = (pathname: string) => {
    if (!isSafeKey(pathname)) throw new Error('Invalid storage path')
    return path.join(root, pathname)
  }

  async function walk(dir: string, rel: string, out: StoredObject[]) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const key = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(full, key, out)
      else {
        const s = await stat(full)
        out.push({ pathname: key, uploadedAt: s.mtime, size: s.size })
      }
    }
  }

  return {
    kind: 'local',
    async put(pathname, body) {
      const file = resolve(pathname)
      await mkdir(path.dirname(file), { recursive: true })
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await body.arrayBuffer())
      await writeFile(file, bytes)
    },
    async get(pathname) {
      try {
        const bytes = await readFile(resolve(pathname))
        return { body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, contentType: contentTypeFor(pathname) }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
    async list(prefix) {
      // Walk only the deepest directory named by the prefix, then filter.
      const dirPart = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : ''
      if (dirPart && !isSafeKey(dirPart)) return []
      const out: StoredObject[] = []
      await walk(path.join(root, dirPart), dirPart, out)
      return out.filter((o) => o.pathname.startsWith(prefix))
    },
    async del(pathnames) {
      await Promise.all(pathnames.map((p) => rm(resolve(p), { force: true })))
    },
  }
}

export function getStorage(): ObjectStorage | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) return vercelBlobStorage(token)
  const dir = process.env.STORAGE_DIR
  if (dir) return localStorageDriver(path.resolve(dir))
  return null
}

export const STORAGE_NOT_CONFIGURED =
  'Photo storage is not configured — set BLOB_READ_WRITE_TOKEN (Vercel Blob) or STORAGE_DIR (local folder).'
