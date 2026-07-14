import { findBestMatch } from './exerciseNameMatch'
import index from './exercise-media/index.json'

type LocalMediaEntry = { name: string; slug: string; images: string[] }

const entries = index as LocalMediaEntry[]

export function findLocalMedia(exerciseName: string): { slug: string; images: string[] } | null {
  const match = findBestMatch(entries, exerciseName, (e) => e.name)
  if (!match) return null
  return { slug: match.slug, images: match.images }
}
