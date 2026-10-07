import assert from 'node:assert/strict'
import { integrationStatus } from './integrations'

assert.deepEqual(integrationStatus({}), { garmin: false, renpho: false })
assert.deepEqual(integrationStatus({ GARMIN_EMAIL: 'a', GARMIN_PASSWORD: '' }), { garmin: false, renpho: false })
assert.deepEqual(
  integrationStatus({ GARMIN_EMAIL: 'a', GARMIN_PASSWORD: 'b', RENPHO_EMAIL: 'c', RENPHO_PASSWORD: 'd' }),
  { garmin: true, renpho: true },
)
console.log('integrations tests passed')
