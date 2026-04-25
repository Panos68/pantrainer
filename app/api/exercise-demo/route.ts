const cache = new Map<string, string>()

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function youtubeUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to ${name}`)}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')?.trim()
  if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

  if (cache.has(name)) {
    return Response.json({ url: cache.get(name) })
  }

  const musclewikiUrl = `https://musclewiki.com/exercise/${slugify(name)}`

  try {
    const res = await fetch(musclewikiUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })
    console.log(`[exercise-demo] ${musclewikiUrl} → ${res.status}`)
    const url = res.ok ? musclewikiUrl : youtubeUrl(name)
    cache.set(name, url)
    return Response.json({ url })
  } catch {
    const url = youtubeUrl(name)
    cache.set(name, url)
    return Response.json({ url })
  }
}
