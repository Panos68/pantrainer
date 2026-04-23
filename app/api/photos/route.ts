import { put } from '@vercel/blob'

function sanitizeFilename(name: string): string {
  const normalized = name.trim().replace(/\s+/g, '-').toLowerCase()
  return normalized.replace(/[^a-z0-9._-]/g, '')
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file')
  const date = (formData.get('date') as string | null) ?? 'unknown-date'

  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image uploads are supported' }, { status: 415 })
  }

  const filename = sanitizeFilename(file.name || 'photo.jpg')
  const pathname = `data/session-photos/${date}/${filename}`

  const uploaded = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: true,
    contentType: file.type,
  })

  return Response.json({
    url: uploaded.url,
    pathname: uploaded.pathname,
  })
}
