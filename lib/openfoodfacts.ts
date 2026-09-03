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
}

// OFF asks API clients to identify themselves; anonymous traffic gets throttled.
const USER_AGENT = 'pantrainer/1.0 (personal training log; github.com/Panos68/pantrainer)'

const FIELDS = 'product_name,product_name_sv,brands,nutriments,image_small_url'

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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
    product?: { product_name?: string; product_name_sv?: string; brands?: string; image_small_url?: string; nutriments?: Record<string, unknown> }
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

  if (calories === null) {
    return { found: true, barcode, name, brands: p.brands, imageUrl: p.image_small_url, missingNutriments: true }
  }

  return {
    found: true,
    barcode,
    name,
    brands: p.brands,
    imageUrl: p.image_small_url,
    per100g: { calories, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 },
  }
}
