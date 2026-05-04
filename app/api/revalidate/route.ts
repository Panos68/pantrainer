import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'

// POST /api/revalidate?tag=current-week
// Emergency cache invalidation for a specific tag
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.AUTOMATION_API_TOKEN?.trim()) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tag = req.nextUrl.searchParams.get('tag')
  if (!tag) return Response.json({ error: 'tag required' }, { status: 400 })
  revalidateTag(tag, 'max')
  return Response.json({ revalidated: tag })
}
