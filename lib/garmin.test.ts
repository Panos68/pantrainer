import assert from 'node:assert/strict'

// These are pure-shape tests against the exported types/functions existing and
// being callable — full live-API testing isn't feasible here (see plan notes on
// no test runner / unofficial API), so this test asserts the module's public
// surface and a date-format guard, not live Garmin data.
import { fetchBodyBattery, fetchStress } from './garmin'

async function run() {
  {
    assert.equal(typeof fetchBodyBattery, 'function', 'fetchBodyBattery is exported as a function')
  }
  {
    assert.equal(typeof fetchStress, 'function', 'fetchStress is exported as a function')
  }
  {
    // Without GARMIN_EMAIL/GARMIN_PASSWORD set, createClient() throws synchronously
    // inside the async function — fetchBodyBattery must NOT let that throw escape,
    // it must catch and resolve null per the Global Constraints contract.
    // This script is a standalone process that exits right after running, so
    // there's no need to save/restore the real env vars — just clear them.
    delete process.env.GARMIN_EMAIL
    delete process.env.GARMIN_PASSWORD
    const result = await fetchBodyBattery('2026-07-30')
    assert.equal(result, null, 'fetchBodyBattery resolves null (not throws) when credentials are missing')
  }
  {
    const result = await fetchStress('2026-07-30')
    assert.equal(result, null, 'fetchStress resolves null (not throws) when credentials are missing')
  }
  console.log('lib/garmin.test.ts: all assertions passed')
}

run()
