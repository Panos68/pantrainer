import { lookupBarcode } from '@/lib/openfoodfacts'
import { getSession } from '@/lib/auth'

export async function GET(request: Request) {
  const session = await getSession(request)
  if (session?.role !== 'owner' && session?.role !== 'food') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const barcode = new URL(request.url).searchParams.get('barcode')
  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return Response.json({ error: 'Invalid or missing barcode' }, { status: 400 })
  }
  try {
    return Response.json(await lookupBarcode(barcode))
  } catch {
    return Response.json({ found: false, barcode, error: 'Lookup service unavailable' })
  }
}
