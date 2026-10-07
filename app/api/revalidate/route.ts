import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'
import { authorizeBearer } from '@/lib/automation-auth'

// POST /api/revalidate?tag=current-week  (Authorization: Bearer <token>)
// Emergency cache invalidation for a specific tag. The secret used to be a
// ?secret= query param, which leaks into access logs; header only now.
export async function POST(req: NextRequest) {
  if (!(await authorizeBearer(req))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tag = req.nextUrl.searchParams.get('tag')
  if (!tag) return Response.json({ error: 'tag required' }, { status: 400 })
  revalidateTag(tag, { expire: 0 })
  return Response.json({ revalidated: tag })
}
