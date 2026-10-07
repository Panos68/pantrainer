import assert from 'node:assert/strict'
import { inventoryWithBar, nextBarWeight, plateBreakdown, usesBarbell } from './plates'

function testStandardLoads() {
  assert.deepEqual(plateBreakdown(100), { perSide: [25, 15], loadedKg: 100, exact: true })
  assert.deepEqual(plateBreakdown(62.5), { perSide: [20, 1.25], loadedKg: 62.5, exact: true })
  assert.deepEqual(plateBreakdown(20), { perSide: [], loadedKg: 20, exact: true })
}

function testInexactRoundsDown() {
  // 61 kg isn't loadable with 1.25s: nearest below is 60.
  assert.deepEqual(plateBreakdown(61), { perSide: [20], loadedKg: 60, exact: false })
}

function testLimitedInventory() {
  const home = { barKg: 15, plates: [{ kg: 10, pairs: 1 }, { kg: 5, pairs: 2 }] }
  assert.deepEqual(plateBreakdown(45, home), { perSide: [10, 5], loadedKg: 45, exact: true })
  // More than the owner owns: load everything, report what's on the bar.
  assert.deepEqual(plateBreakdown(80, home), { perSide: [10, 5, 5], loadedKg: 55, exact: false })
}

function testInvalid() {
  assert.equal(plateBreakdown(0), null)
  assert.equal(plateBreakdown(15), null) // lighter than the bar
}

function testUsesBarbell() {
  assert.equal(usesBarbell('Bench Press'), true)
  assert.equal(usesBarbell('Barbell Row'), true)
  assert.equal(usesBarbell('Push Press'), true)
  assert.equal(usesBarbell('Dumbbell Bench Press'), false)
  assert.equal(usesBarbell('Smith Machine Squat'), false)
  assert.equal(usesBarbell('Lat Pulldown'), false)
}

function testBarToggle() {
  assert.equal(nextBarWeight(20), 15)
  assert.equal(nextBarWeight(15), 10)
  assert.equal(nextBarWeight(10), 20)
  assert.equal(nextBarWeight(17), 20) // unknown value restarts the cycle
  assert.deepEqual(plateBreakdown(60, inventoryWithBar(15))?.perSide, [20, 2.5])
}

testStandardLoads()
testBarToggle()
testInexactRoundsDown()
testLimitedInventory()
testInvalid()
testUsesBarbell()
console.log('plates tests passed')
