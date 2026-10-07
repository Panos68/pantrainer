'use client'

import { useEffect, useState } from 'react'
import type { IntegrationStatus } from './integrations'

// Assume enabled until the server says otherwise, so configured instances
// never flash their Garmin controls away on load.
const OPTIMISTIC: IntegrationStatus = { garmin: true, renpho: true }

let cached: Promise<IntegrationStatus> | null = null

function loadIntegrations(): Promise<IntegrationStatus> {
  cached ??= fetch('/api/integrations')
    .then((res) => (res.ok ? (res.json() as Promise<IntegrationStatus>) : OPTIMISTIC))
    .catch(() => OPTIMISTIC)
  return cached
}

export function useIntegrations(): IntegrationStatus {
  const [status, setStatus] = useState<IntegrationStatus>(OPTIMISTIC)
  useEffect(() => {
    let cancelled = false
    loadIntegrations().then((s) => { if (!cancelled) setStatus(s) })
    return () => { cancelled = true }
  }, [])
  return status
}
