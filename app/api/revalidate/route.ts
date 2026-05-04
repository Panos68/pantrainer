import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'

// POST /api/revalidate?tag=current-week
// Emergency cache invalidation for a specific tag
export async function POST(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get('tag')
  if (!tag) return Response.json({ error: 'tag required' }, { status: 400 })
  revalidateTag(tag, 'max')
  return Response.json({ revalidated: tag })
}
