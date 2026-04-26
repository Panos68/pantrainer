import JSZip from 'jszip'
import { head } from '@vercel/blob'

interface ExportWithPhotos {
  photos_to_attach: string[]
}

function fileExtFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url)
    const match = pathname.match(/(\.[a-z0-9]+)$/i)
    return match ? match[1].toLowerCase() : '.jpg'
  } catch {
    return '.jpg'
  }
}

async function fetchPhotoBytes(photoRef: string): Promise<{ bytes: ArrayBuffer; ext: string }> {
  if (photoRef.startsWith('http://') || photoRef.startsWith('https://')) {
    const photoRes = await fetch(photoRef, { cache: 'no-store' })
    if (!photoRes.ok) {
      throw new Error(`Failed to fetch photo for bundle: ${photoRef}`)
    }
    return {
      bytes: await photoRes.arrayBuffer(),
      ext: fileExtFromUrl(photoRef),
    }
  }

  const blob = await head(photoRef)
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const photoRes = await fetch(blob.url, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!photoRes.ok) {
    throw new Error(`Failed to fetch private photo for bundle: ${photoRef}`)
  }

  return {
    bytes: await photoRes.arrayBuffer(),
    ext: fileExtFromUrl(blob.url),
  }
}

function zipFilenameFromJsonFilename(jsonFilename: string): string {
  if (jsonFilename.toLowerCase().endsWith('.json')) {
    return `${jsonFilename.slice(0, -5)}.zip`
  }
  return `${jsonFilename}.zip`
}

export async function buildExportBundleResponse(
  payload: ExportWithPhotos,
  jsonFilename: string,
): Promise<Response> {
  const zip = new JSZip()
  zip.file(jsonFilename, JSON.stringify(payload, null, 2))

  const uniquePhotos = Array.from(
    new Set((payload.photos_to_attach ?? []).filter((url) => typeof url === 'string' && url.length > 0)),
  )

  const photoManifest: Array<{ source_url: string; bundle_path: string }> = []

  for (let i = 0; i < uniquePhotos.length; i += 1) {
    const sourceUrl = uniquePhotos[i]
    let photoBytes: ArrayBuffer
    let ext: string
    try {
      const fetched = await fetchPhotoBytes(sourceUrl)
      photoBytes = fetched.bytes
      ext = fetched.ext
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : `Failed to fetch photo for bundle: ${sourceUrl}` },
        { status: 502 },
      )
    }
    const bundlePath = `photos/${String(i + 1).padStart(2, '0')}${ext}`
    zip.file(bundlePath, photoBytes)
    photoManifest.push({
      source_url: sourceUrl,
      bundle_path: bundlePath,
    })
  }

  zip.file('photos-manifest.json', JSON.stringify(photoManifest, null, 2))

  const zipBytes = await zip.generateAsync({ type: 'arraybuffer' })
  const zipFilename = zipFilenameFromJsonFilename(jsonFilename)

  return new Response(zipBytes, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
      'X-Photos-Included': String(uniquePhotos.length),
    },
  })
}
