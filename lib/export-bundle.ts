import JSZip from 'jszip'

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
    const photoRes = await fetch(sourceUrl, { cache: 'no-store' })
    if (!photoRes.ok) {
      return Response.json(
        { error: `Failed to fetch photo for bundle: ${sourceUrl}` },
        { status: 502 },
      )
    }

    const photoBytes = await photoRes.arrayBuffer()
    const ext = fileExtFromUrl(sourceUrl)
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
