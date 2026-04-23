import { head, put } from '@vercel/blob'

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
  const pathname = `data/session-photos/${date}/${filename}`

  try {
    const uploaded = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
      contentType: file.type,
    })

    return Response.json({
      pathname: uploaded.pathname,
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

  const { searchParams } = new URL(request.url)
  const pathname = searchParams.get('pathname')
  if (!pathname) {
    return Response.json({ error: 'Missing pathname' }, { status: 400 })
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
