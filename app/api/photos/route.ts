import { getStorage, isSafeKey, STORAGE_NOT_CONFIGURED } from '@/lib/storage'
import { signPath, signingSecret, verifyPathSignature } from '@/lib/signed-url'
import { getSession } from '@/lib/auth'

export function signPhotoUrl(baseUrl: string, pathname: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const url = new URL(`${baseUrl}/api/photos`)
  url.searchParams.set('pathname', pathname)
  url.searchParams.set('exp', String(exp))
  url.searchParams.set('sig', signPath(pathname, exp, signingSecret()))
  return url.toString()
}

function sanitizeFilename(name: string): string {
  const normalized = name.trim().replace(/\s+/g, '-').toLowerCase()
  return normalized.replace(/[^a-z0-9._-]/g, '')
}

export async function POST(request: Request) {
  const storage = getStorage()
  if (!storage) {
    return Response.json({ error: STORAGE_NOT_CONFIGURED }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const date = (formData.get('date') as string | null) ?? 'unknown-date'
  if (date !== 'unknown-date' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid date' }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported' }, { status: 415 })
  }

  const filename = sanitizeFilename(file.name || 'photo.jpg') || 'photo.jpg'
  const pathname = `data/session-photos/${date}/${Date.now()}-${filename}`

  try {
    await storage.put(pathname, file, file.type)

    return Response.json({
      pathname,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to upload photo' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  const storage = getStorage()
  if (!storage) {
    return Response.json({ error: STORAGE_NOT_CONFIGURED }, { status: 500 })
  }

  const { searchParams: sp } = new URL(request.url)
  const pathname = sp.get('pathname')
  if (!pathname) {
    return Response.json({ error: 'Missing pathname' }, { status: 400 })
  }
  if (!pathname.startsWith('data/session-photos/') || !isSafeKey(pathname)) {
    return Response.json({ error: 'Invalid pathname' }, { status: 403 })
  }

  // Cookie-authenticated browser requests skip sig check. The auth cookie
  // holds a signed session token (see lib/auth.ts), not the raw password —
  // must go through getSession, a plain equality check never matches.
  const session = await getSession(request)
  const isSessionAuthed = session?.role === 'owner' || session?.role === 'food'

  if (!isSessionAuthed) {
    if (!verifyPathSignature(pathname, sp.get('exp'), sp.get('sig'), signingSecret())) {
      return Response.json({ error: 'Invalid or expired signature' }, { status: 403 })
    }
  }

  try {
    const object = await storage.get(pathname)
    if (!object) {
      return Response.json({ error: 'Photo not found' }, { status: 404 })
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.contentType,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to read photo blob' },
      { status: 500 },
    )
  }
}
