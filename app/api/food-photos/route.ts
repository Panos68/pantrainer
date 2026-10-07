import { getStorage, isSafeKey, STORAGE_NOT_CONFIGURED } from '@/lib/storage'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'
import { signPath, signingSecret, verifyPathSignature } from '@/lib/signed-url'
import { authorizeBearer } from '@/lib/automation-auth'
import { getSession } from '@/lib/auth'
import { resizeFoodPhoto } from '@/lib/image-resize'

// The auth cookie holds a signed session token (see lib/auth.ts), not the raw
// password — this must go through getSession, a plain equality check against
// AUTH_PASSWORD never matches and silently locks every browser request out.
async function isCookieAuthed(request: Request): Promise<boolean> {
  const session = await getSession(request)
  return session?.role === 'owner' || session?.role === 'food'
}

export function signFoodPhotoUrl(baseUrl: string, pathname: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const url = new URL(`${baseUrl}/api/food-photos`)
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
  // Browser uploads carry the login cookie (owner or food role); the iOS
  // Shortcut carries a Bearer token. The proxy lets Bearer requests through,
  // so this route must check them itself.
  if (!(await isCookieAuthed(request)) && !(await authorizeBearer(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storage = getStorage()
  if (!storage) {
    return Response.json({ error: STORAGE_NOT_CONFIGURED }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const date = (formData.get('date') as string | null) || todayIsoInAppTimeZone()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Invalid date' }, { status: 400 })
  }

  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported' }, { status: 415 })
  }

  const originalFilename = sanitizeFilename(file.name || 'photo.jpg') || 'photo.jpg'

  // Camera-resolution originals are the main driver of Blob storage/transfer
  // growth — downscale + re-encode before it ever reaches Blob. If a source
  // image can't be processed (unsupported format, corrupt file), fall back to
  // storing the original rather than blocking the upload entirely.
  let body: Buffer | File = file
  let contentType = file.type
  let filename = originalFilename
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    body = await resizeFoodPhoto(inputBuffer)
    contentType = 'image/jpeg'
    filename = originalFilename.replace(/\.[a-z0-9]+$/i, '') + '.jpg'
  } catch (error) {
    console.error('food-photos: resize failed, storing original', error)
  }

  const pathname = `data/food-photos/${date}/${Date.now()}-${filename}`

  try {
    await storage.put(pathname, body, contentType)

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
  const date = sp.get('date')

  if (!pathname && date) {
    if (!(await isCookieAuthed(request))) {
      return Response.json({ error: 'Not authenticated' }, { status: 403 })
    }
    try {
      const objects = await storage.list(`data/food-photos/${date}/`)
      return Response.json({
        photos: objects.map((o) => o.pathname).sort(),
      })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to list photos' },
        { status: 500 },
      )
    }
  }

  if (!pathname) {
    return Response.json({ error: 'Missing pathname or date' }, { status: 400 })
  }
  if (!pathname.startsWith('data/food-photos/') || !isSafeKey(pathname)) {
    return Response.json({ error: 'Invalid pathname' }, { status: 403 })
  }

  if (!(await isCookieAuthed(request))) {
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

export async function DELETE(request: Request) {
  const storage = getStorage()
  if (!storage) {
    return Response.json({ error: STORAGE_NOT_CONFIGURED }, { status: 500 })
  }

  if (!(await isCookieAuthed(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 403 })
  }

  const { searchParams: sp } = new URL(request.url)
  const pathname = sp.get('pathname')
  if (!pathname) {
    return Response.json({ error: 'Missing pathname' }, { status: 400 })
  }
  if (!pathname.startsWith('data/food-photos/') || !isSafeKey(pathname)) {
    return Response.json({ error: 'Invalid pathname' }, { status: 403 })
  }

  try {
    await storage.del([pathname])
    return Response.json({ deleted: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to delete photo' },
      { status: 500 },
    )
  }
}
