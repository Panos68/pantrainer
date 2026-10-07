// Optional third-party integrations. Each is enabled purely by its credentials
// being configured; the rest of the app works without any of them.
export interface IntegrationStatus {
  garmin: boolean
  renpho: boolean
}

export function integrationStatus(env: Record<string, string | undefined> = process.env): IntegrationStatus {
  return {
    garmin: Boolean(env.GARMIN_EMAIL && env.GARMIN_PASSWORD),
    renpho: Boolean(env.RENPHO_EMAIL && env.RENPHO_PASSWORD),
  }
}
