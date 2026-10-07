import { integrationStatus } from '@/lib/integrations'

// Which optional integrations this instance has credentials for. Booleans
// only — never the credentials themselves.
export function GET() {
  return Response.json(integrationStatus())
}
