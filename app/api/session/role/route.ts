import { getSession } from '@/lib/auth'

// Split out of app/layout.tsx: reading cookies() in the root layout forced
// every route in the app to render dynamically, since the layout wraps every
// page. This is only used for a client-side nav-visibility decision (not a
// security boundary), so it's fetched from the client instead.
export async function GET(request: Request) {
  const session = await getSession(request)
  return Response.json({ role: session?.role ?? null })
}
