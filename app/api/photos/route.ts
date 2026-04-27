import { head, put } from '@vercel/blob'
import { createHmac, timingSafeEqual } from 'crypto'

export function signPhotoUrl(baseUrl: string, pathname: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const secret = process.env.AUTH_PASSWORD ?? ''
  const sig = createHmac('sha256', secret).update(`${pathname}:${exp}`).digest('hex')
  const url = new URL(`${baseUrl}/api/photos`)
  url.searchParams.set('pathname', pathname)
  url.searchParams.set('exp', String(exp))
  url.searchParams.set('sig', sig)
  return url.toString()
}

function verifyPhotoSig(pathname: string, exp: string, sig: string): boolean {
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
  const date = (formData.get('date') as string | null) ?? 'unknown-date'

  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported' }, { status: 415 })
  }

  const filename = sanitizeFilename(file.name || 'photo.jpg') || 'photo.jpg'
  const pathname = `data/session-photos/${date}/${Date.now()}-${filename}`

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
  if (!pathname) {
    return Response.json({ error: 'Missing pathname' }, { status: 400 })
  }
  if (!pathname.startsWith('data/session-photos/')) {
    return Response.json({ error: 'Invalid pathname' }, { status: 403 })
  }

  // Cookie-authenticated browser requests skip sig check (middleware already validated auth cookie)
  const cookie = request.headers.get('cookie') ?? ''
  const authCookie = cookie.split(';').find((c) => c.trim().startsWith('auth='))?.split('=')[1]?.trim()
  const isSessionAuthed = authCookie === process.env.AUTH_PASSWORD

  if (!isSessionAuthed) {
    const exp = sp.get('exp')
    const sig = sp.get('sig')
    if (!exp || !sig || !verifyPhotoSig(pathname, exp, sig)) {
      return Response.json({ error: 'Invalid or expired signature' }, { status: 403 })
    }
  }

  try {
    const blob = await head(pathname)
    const res = await fetch(blob.url, {
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
