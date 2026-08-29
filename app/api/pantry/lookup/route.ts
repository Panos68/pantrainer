import { lookupBarcode } from '@/lib/openfoodfacts'

// Proxied server-side rather than called from the browser: Open Food Facts
// requires an identifying User-Agent, and going through the server avoids CORS
// and keeps their occasional outages handled in one place.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barcode = searchParams.get('barcode')

  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return Response.json({ error: 'Invalid or missing barcode' }, { status: 400 })
  }

  try {
    const result = await lookupBarcode(barcode)
    return Response.json(result)
  } catch (err) {
    console.error('Barcode lookup failed:', err)
    return Response.json({ found: false, barcode, error: 'Lookup service unavailable' })
  }
}
