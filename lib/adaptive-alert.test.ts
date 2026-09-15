import assert from 'node:assert/strict'
import { calcAdaptiveAlert } from './adaptive-alert'

function testWarnsOnLowRecoveryWithHighConfidence() {
  const alert = calcAdaptiveAlert(30, 0.9, 'Hyrox', null, 'planned')
  assert.equal(alert?.level, 'warn')
}

function testSuppressedBelowConfidenceFloor() {
  // Same low score, but confidence too low to trust it — no alert should fire.
  const alert = calcAdaptiveAlert(30, 0.3, 'Hyrox', null, 'planned')
  assert.equal(alert, null)
}

function testStillNoAlertForCompletedSessions() {
  const alert = calcAdaptiveAlert(20, 0.9, 'Hyrox', null, 'completed')
  assert.equal(alert, null)
}

testWarnsOnLowRecoveryWithHighConfidence()
testSuppressedBelowConfidenceFloor()
testStillNoAlertForCompletedSessions()
console.log('lib/adaptive-alert.test.ts: all assertions passed')
