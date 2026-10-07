import assert from 'node:assert/strict'

process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/never-connected'
process.env.AUTH_SESSION_SECRET = 'test-session-secret'
process.env.AUTOMATION_API_TOKEN = 'legacy-test-token'
process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token'

const u = (p: string) => `http://localhost${p}`

async function expect401(label: string, res: Response) {
  assert.equal(res.status, 401, `${label} should be 401, got ${res.status}`)
}

async function main() {
  const mcp = await import('../app/api/mcp/route')
  await expect401('mcp POST', await mcp.POST(new Request(u('/api/mcp'), { method: 'POST', body: '{}' })))

  const notes = await import('../app/api/automation/notes/route')
  await expect401('notes GET', await notes.GET(new Request(u('/api/automation/notes'))))
  await expect401('notes PATCH', await notes.PATCH(new Request(u('/api/automation/notes'), { method: 'PATCH', body: '{}' })))

  const proposed = await import('../app/api/automation/proposed/route')
  await expect401('proposed POST', await proposed.POST(new Request(u('/api/automation/proposed'), { method: 'POST', body: '{}' })))

  const today = await import('../app/api/automation/proposed/today/route')
  await expect401('proposed/today POST', await today.POST(new Request(u('/api/automation/proposed/today'), { method: 'POST', body: '{}' })))

  const exportV2 = await import('../app/api/automation/export/v2/route')
  await expect401('export v2 GET', await exportV2.GET(new Request(u('/api/automation/export/v2'))))

  const { NextRequest } = await import('next/server')
  const revalidate = await import('../app/api/revalidate/route')
  await expect401('revalidate secret-in-query no longer accepted', await revalidate.POST(new NextRequest(u('/api/revalidate?tag=x&secret=legacy-test-token'), { method: 'POST' })))

  const foodPhotos = await import('../app/api/food-photos/route')
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
  await expect401('food-photos POST', await foodPhotos.POST(new Request(u('/api/food-photos'), { method: 'POST', body: form })))

  console.log('route-auth tests passed')
  process.exit(0)
}
void main()
