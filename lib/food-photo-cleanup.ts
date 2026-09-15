const PATHNAME_DATE_RE = /^data\/food-photos\/(\d{4}-\d{2}-\d{2})\//

// Pure selection logic: a photo is only deleted once it's both past the
// retention window AND already folded into a saved nutrition estimate.
// Pending (not-yet-analyzed) photos are kept regardless of age — the user
// still needs them to log the day.
export function selectFoodPhotosToDelete(
  pathnames: string[],
  analyzedPathnames: Set<string>,
  cutoffDate: string,
): string[] {
  return pathnames.filter((pathname) => {
    const match = pathname.match(PATHNAME_DATE_RE)
    if (!match) return false
    const date = match[1]
    if (date >= cutoffDate) return false
    return analyzedPathnames.has(pathname)
  })
}
