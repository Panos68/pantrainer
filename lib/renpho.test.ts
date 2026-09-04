import assert from 'node:assert/strict'

// Pure-shape tests against the exported function existing and being callable —
// full live-API testing isn't feasible here (unofficial Renpho API, same as
// lib/garmin.test.ts's constraints).
import { fetchRecentMeasurements } from './renpho'

async function run() {
  {
    assert.equal(typeof fetchRecentMeasurements, 'function', 'fetchRecentMeasurements is exported as a function')
  }
  {
    // Without RENPHO_EMAIL/RENPHO_PASSWORD (and no MONGODB_URI needed to reach
    // that point — login() throws before any DB/network call), the missing
    // credentials must not escape as a thrown error — resolve [] instead.
    delete process.env.RENPHO_EMAIL
    delete process.env.RENPHO_PASSWORD
    const result = await fetchRecentMeasurements()
    assert.deepEqual(result, [], 'fetchRecentMeasurements resolves [] (not throws) when credentials are missing')
  }
  console.log('lib/renpho.test.ts: all assertions passed')
}

run()
