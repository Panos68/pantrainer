// Demo instances (DEMO_MODE=true) let anyone in with one click and run on
// throwaway seeded data. Account-level actions stay off so a visitor can't
// lock others out or connect external tools.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true'
}

export function demoForbidden(): Response | null {
  return isDemoMode()
    ? Response.json({ error: 'Disabled on the demo instance — self-host your own to use this.' }, { status: 403 })
    : null
}
