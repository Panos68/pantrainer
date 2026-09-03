function validDate(year: number, month: number, day: number): string | null {
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function yearFrom(value: string): number {
  const year = Number(value)
  return value.length === 2 ? 2000 + year : year
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2,
  mar: 3, march: 3, mars: 3, apr: 4, april: 4, may: 5, maj: 5,
  jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11, dec: 12, december: 12,
}

export function extractExpiryDate(text: string): string | null {
  const numeric = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/)
  if (numeric) return validDate(yearFrom(numeric[3]), Number(numeric[2]), Number(numeric[1]))

  const namedMonth = text.toLowerCase().match(/\b(\d{1,2})\s+([a-z]+)\.?\s*(\d{2,4})?\b/i)
  if (namedMonth) {
    const month = MONTHS[namedMonth[2].toLowerCase()]
    if (month) return validDate(namedMonth[3] ? yearFrom(namedMonth[3]) : new Date().getFullYear(), month, Number(namedMonth[1]))
  }
  return null
}
