import { put, list, del } from '@vercel/blob'
import { blobUrl } from '@/lib/blob-url'
import { todayIsoInAppTimeZone } from '@/lib/app-timezone'
import { createHmac, timingSafeEqual } from 'crypto'
import { getSession } from '@/lib/auth'

// The auth cookie holds a signed session token (see lib/auth.ts), not the raw
// password — this must go through getSession, a plain equality check against
// AUTH_PASSWORD never matches and silently locks every browser request out.
async function isCookieAuthed(request: Request): Promise<boolean> {
  const session = await getSession(request)
  return session?.role === 'owner' || session?.role === 'food'
}

export function signFoodPhotoUrl(baseUrl: string, pathname: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const secret = process.env.AUTH_PASSWORD ?? ''
  const sig = createHmac('sha256', secret).update(`${pathname}:${exp}`).digest('hex')
  const url = new URL(`${baseUrl}/api/food-photos`)
  url.searchParams.set('pathname', pathname)
  url.searchParams.set('exp', String(exp))
  url.searchParams.set('sig', sig)
  return url.toString()
}

function verifyFoodPhotoSig(pathname: string, exp: string, sig: string): boolean {
  const expTs = Number(exp)
  if (!expTs || Date.now() / 1000 > expTs) return false
  const secret = process.env.AUTH_PASSWORD ?? ''
  const expected = createHmac('sha256', secret).update(`${pathname}:${expTs}`).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

function sanitizeFilename(name: string): string {
  const normalized = name.trim().replace(/\s+/g, '-').toLowerCase()
  return normalized.replace(/[^a-z0-9._-]/g, '')
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured' },
      { status: 500 },
    )
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const date = (formData.get('date') as string | null) || todayIsoInAppTimeZone()

  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported' }, { status: 415 })
  }

  const filename = sanitizeFilename(file.name || 'photo.jpg') || 'photo.jpg'
  const pathname = `data/food-photos/${date}/${Date.now()}-${filename}`

  try {
    await put(pathname, file, {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.type,
    })

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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured' },
      { status: 500 },
    )
  }

  const { searchParams: sp } = new URL(request.url)
  const pathname = sp.get('pathname')
  const date = sp.get('date')

  if (!pathname && date) {
    if (!(await isCookieAuthed(request))) {
      return Response.json({ error: 'Not authenticated' }, { status: 403 })
    }
    try {
      const { blobs } = await list({
        prefix: `data/food-photos/${date}/`,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      return Response.json({
        photos: blobs.map((b) => b.pathname).sort(),
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
  if (!pathname.startsWith('data/food-photos/')) {
    return Response.json({ error: 'Invalid pathname' }, { status: 403 })
  }

  if (!(await isCookieAuthed(request))) {
    const exp = sp.get('exp')
    const sig = sp.get('sig')
    if (!exp || !sig || !verifyFoodPhotoSig(pathname, exp, sig)) {
      return Response.json({ error: 'Invalid or expired signature' }, { status: 403 })
    }
  }

  try {
    const res = await fetch(blobUrl(pathname), {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!res.ok) {
      return Response.json({ error: 'Failed to read photo blob' }, { status: 502 })
    }

    const bytes = await res.arrayBuffer()
    return new Response(bytes, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured' },
      { status: 500 },
    )
  }

  if (!(await isCookieAuthed(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 403 })
  }

  const { searchParams: sp } = new URL(request.url)
  const pathname = sp.get('pathname')
  if (!pathname) {
    return Response.json({ error: 'Missing pathname' }, { status: 400 })
  }
  if (!pathname.startsWith('data/food-photos/')) {
    return Response.json({ error: 'Invalid pathname' }, { status: 403 })
  }

  try {
    await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN })
    return Response.json({ deleted: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to delete photo' },
      { status: 500 },
    )
  }
}
