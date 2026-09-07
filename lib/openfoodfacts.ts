// Barcode -> nutrition lookup against Open Food Facts.
//
// OFF is free and needs no key, but it is crowdsourced: a product may be absent
// entirely, or present with a name and no nutriment data at all. Every lookup
// therefore feeds a form the athlete confirms — never a silent save.

export interface BarcodeLookup {
  found: boolean
  barcode: string
  name?: string
  brands?: string
  imageUrl?: string
  per100g?: { calories: number; protein: number; carbs: number; fat: number }
  /** Set when the product exists but has no usable nutriment data. */
  missingNutriments?: boolean
  /** OFF's raw net-quantity text, e.g. "4 x 100 g" or "400 g" — shown as-is, never parsed silently into a saved value. */
  netQuantityText?: string
  /** Pack count parsed from netQuantityText (e.g. "4 x 100 g" -> 4), when OFF's text follows that pattern. Null otherwise. */
  packCount?: number | null
}

// OFF asks API clients to identify themselves; anonymous traffic gets throttled.
const USER_AGENT = 'pantrainer/1.0 (personal training log; github.com/Panos68/pantrainer)'

const FIELDS = 'product_name,product_name_sv,brands,nutriments,image_small_url,quantity'

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// OFF's `quantity` field is free text entered by contributors — "4 x 100 g",
// "4x100g", "6 pack", "400 g" all appear in the wild. Only the multipack
// "N x ..." / "N pack" shape is unambiguous enough to prefill a count from;
// anything else (a single weight like "400 g") isn't a pack count at all.
function parsePackCount(quantityText: string): number | null {
  const packMatch = quantityText.match(/^(\d+)\s*[x×]\s*/i) ?? quantityText.match(/^(\d+)\s*-?\s*pack\b/i)
  if (!packMatch) return null
  const count = parseInt(packMatch[1], 10)
  return count > 0 ? count : null
}

// Best-effort image for a Quick Add name with no barcode. OFF's coverage is
// branded/packaged products, so a generic term ("chicken") can match the
// wrong specific product — this is silent (no confirmation step, unlike
// lookupBarcode), so it's accepted as an approximate, sometimes-wrong photo
// rather than an authoritative match.
export async function searchProductImageByName(name: string): Promise<string | null> {
  // OFF's older /cgi/search.pl and /api/v2/search text-search endpoints are
  // both currently down ("Page temporarily unavailable") — this is the
  // still-live search-a-licious service that replaced them.
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(name)}&page_size=1&fields=image_small_url`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null

    const json = await res.json() as { hits?: Array<{ image_small_url?: string }> }
    return json.hits?.[0]?.image_small_url || null
  } catch {
    return null
  }
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookup> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    // OFF is occasionally slow; fail fast rather than hanging the scan UI.
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    // 404 is a genuine "not in the database"; anything else is OFF being
    // unavailable. Both leave the athlete typing the values manually, so they
    // collapse to the same outcome here.
    return { found: false, barcode }
  }

  const json = await res.json() as {
    status?: number
    product?: { product_name?: string; product_name_sv?: string; brands?: string; image_small_url?: string; nutriments?: Record<string, unknown>; quantity?: string }
  }

  if (json.status !== 1 || !json.product) {
    return { found: false, barcode }
  }

  const p = json.product
  const n = p.nutriments ?? {}

  const calories = num(n['energy-kcal_100g'])
  const protein = num(n.proteins_100g)
  const carbs = num(n.carbohydrates_100g)
  const fat = num(n.fat_100g)

  // Swedish name first — this athlete shops in Sweden and the localized name is
  // what appears on the tub.
  const name = p.product_name_sv || p.product_name
  const netQuantityText = p.quantity || undefined
  const packCount = netQuantityText ? parsePackCount(netQuantityText) : null

  if (calories === null) {
    return { found: true, barcode, name, brands: p.brands, imageUrl: p.image_small_url, missingNutriments: true, netQuantityText, packCount }
  }

  return {
    found: true,
    barcode,
    name,
    brands: p.brands,
    imageUrl: p.image_small_url,
    per100g: { calories, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 },
    netQuantityText,
    packCount,
  }
}
