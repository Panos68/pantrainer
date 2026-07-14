const EQUIPMENT = new Set(['barbell', 'dumbbell', 'dumbbells', 'kettlebell', 'cable', 'band', 'trx', 'plate', 'machine', 'smith'])

const ABBREVIATIONS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbells',
  bb: 'barbell',
  kb: 'kettlebell',
}

export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABBREVIATIONS[t] ?? t)
}

export function coreTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !EQUIPMENT.has(t))
}

function score(hayName: string, needleTokens: string[], needleCore: string[]): number {
  const hayTokens = tokenize(hayName)
  const hayCore = coreTokens(hayTokens)

  if (hayTokens.join(' ') === needleTokens.join(' ')) return 100

  const allPresent = needleTokens.every((t) => hayTokens.includes(t))
  if (!allPresent) return 0

  const coreMatches = needleCore.filter((t) => hayCore.includes(t)).length
  if (coreMatches === 0) return 0

  const extraWords = hayTokens.filter((t) => !needleTokens.includes(t)).length
  const needleHasEquipment = needleTokens.some((t) => EQUIPMENT.has(t))
  const barbellBonus = !needleHasEquipment && hayTokens.includes('barbell') ? 1 : 0

  return (coreMatches * 4) + barbellBonus - extraWords
}

export function findBestMatch<T>(items: T[], name: string, getName: (item: T) => string): T | null {
  const needleTokens = tokenize(name)
  const needleCore = coreTokens(needleTokens)

  let best: T | null = null
  let bestScore = 1 // minimum threshold

  for (const item of items) {
    const s = score(getName(item), needleTokens, needleCore)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  }

  return best
}
