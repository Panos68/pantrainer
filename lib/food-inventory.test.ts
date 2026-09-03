import assert from 'node:assert/strict'
import { FoodInventoryItemSchema } from './schema'

const item = FoodInventoryItemSchema.parse({
  _id: 'test-item',
  name: 'Kvarg',
  barcode: '7310865004708',
  imageUrl: 'https://images.openfoodfacts.org/images/products/731/086/500/4708/front_sv.3.200.jpg',
  location: 'fridge',
  quantity: '1 tub',
  expiresOn: '2026-09-10',
  createdAt: '2026-09-03T10:00:00.000Z',
  updatedAt: '2026-09-03T10:00:00.000Z',
})

assert.equal(item.imageUrl?.startsWith('https://'), true)
assert.equal(item.status, 'available')
assert.equal(item.opened, false)
console.log('lib/food-inventory.test.ts: all assertions passed')
