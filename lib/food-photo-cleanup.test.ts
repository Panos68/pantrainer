import assert from 'node:assert/strict'
import { selectFoodPhotosToDelete } from './food-photo-cleanup'

function run() {
  {
    // Old + analyzed -> eligible for deletion.
    const pathnames = ['data/food-photos/2026-08-01/111-lunch.jpg']
    const analyzed = new Set(pathnames)
    const result = selectFoodPhotosToDelete(pathnames, analyzed, '2026-09-01')
    assert.deepEqual(result, pathnames, 'old analyzed photo is selected for deletion')
  }

  {
    // Old but still pending (not yet folded into a saved estimate) -> kept.
    const pathnames = ['data/food-photos/2026-08-01/111-lunch.jpg']
    const analyzed = new Set<string>()
    const result = selectFoodPhotosToDelete(pathnames, analyzed, '2026-09-01')
    assert.deepEqual(result, [], 'old pending photo is kept')
  }

  {
    // Analyzed but within the retention window (dated after the cutoff) -> kept.
    const pathnames = ['data/food-photos/2026-09-05/111-lunch.jpg']
    const analyzed = new Set(pathnames)
    const result = selectFoodPhotosToDelete(pathnames, analyzed, '2026-09-01')
    assert.deepEqual(result, [], 'recent analyzed photo is kept until past the cutoff')
  }

  {
    // A pathname on exactly the cutoff date is not yet past retention -> kept.
    const pathnames = ['data/food-photos/2026-09-01/111-lunch.jpg']
    const analyzed = new Set(pathnames)
    const result = selectFoodPhotosToDelete(pathnames, analyzed, '2026-09-01')
    assert.deepEqual(result, [], 'photo dated exactly on the cutoff day is kept')
  }

  {
    // Malformed pathname with no parseable date segment -> ignored defensively.
    const pathnames = ['data/food-photos/not-a-date/111-lunch.jpg']
    const analyzed = new Set(pathnames)
    const result = selectFoodPhotosToDelete(pathnames, analyzed, '2026-09-01')
    assert.deepEqual(result, [], 'malformed pathname is never selected for deletion')
  }

  {
    // Mixed batch -> only the old+analyzed one comes back.
    const pathnames = [
      'data/food-photos/2026-08-01/a.jpg',
      'data/food-photos/2026-08-01/b.jpg',
      'data/food-photos/2026-09-10/c.jpg',
    ]
    const analyzed = new Set(['data/food-photos/2026-08-01/a.jpg', 'data/food-photos/2026-09-10/c.jpg'])
    const result = selectFoodPhotosToDelete(pathnames, analyzed, '2026-09-01')
    assert.deepEqual(result, ['data/food-photos/2026-08-01/a.jpg'], 'only the old, analyzed photo is selected')
  }

  console.log('lib/food-photo-cleanup.test.ts: all assertions passed')
}

run()
