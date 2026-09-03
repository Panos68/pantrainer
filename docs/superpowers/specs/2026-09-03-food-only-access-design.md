# Food-only access — design

**Date:** 2026-09-03

## Problem

Pantrainer currently uses one password and stores that password itself in an
`auth` cookie. Anyone with it can access the whole application: training,
Garmin recovery, nutrition photos/logs, exports, and the pantry.

The planned at-home food inventory needs to be maintained by two people. The
second person needs a fast, phone-friendly way to scan and update shared food,
but must not be able to see or change the athlete's private training or
nutrition data.

Full user accounts and household invitations are unnecessary for a two-person,
single-household app today. A second shared password with a restricted role is
the smallest useful solution.

## Goals

- Keep one Pantrainer deployment, database, and food-product lookup flow.
- Let an owner use the normal app and its existing MCP integration.
- Let a food-only user access one shared food area directly at `/food`.
- Enforce the restriction on the server for pages and APIs, not only in
  navigation.
- Ensure a food-only session cannot authenticate to or use MCP.
- Avoid creating a user, household, or invitation model before it is needed.

## Non-goals

- Individual accounts, user profiles, invitations, or password reset.
- Attribution of each food update to a particular person.
- Separating the current personal nutrition-staples pantry from the athlete.
- The at-home inventory schema, recipe generation, shopping list, or barcode
  inventory workflow. They will have a follow-up design and use the `/food`
  boundary introduced here.
- Giving the food-only user access to personal calorie, macro, food-photo, or
  Garmin data.

## Terminology

- **Owner:** the athlete's existing full-access role. This is the role used for
  Pantrainer's MCP client and any owner UI session.
- **Food:** a restricted shared role used by the second household password.
- **Food area:** the future shared at-home inventory experience rooted at
  `/food`. It is distinct from `/pantry`, which remains the athlete's private
  nutrition-estimator staples library.

## Authentication model

### Environment

Replace the implicit single-password model with two explicit credentials:

| Variable | Role | Required |
| --- | --- | --- |
| `AUTH_PASSWORD` | `owner` | Yes |
| `FOOD_ACCESS_PASSWORD` | `food` | Yes once food-only access is enabled |
| `AUTH_SESSION_SECRET` | Signs role sessions | Yes |

`AUTH_SESSION_SECRET` is a long random value and is never sent to a browser.
It makes a session independently verifiable without placing either password in
a cookie.

For a safe deploy sequence, the code accepts the legacy `auth` cookie only
when it exactly equals `AUTH_PASSWORD`, treats it as `owner`, and replaces it
with a signed session after the next successful owner login. This compatibility
path is temporary and is removed after the existing owner device has logged in
once. A deployment must not invalidate the existing MCP OAuth bearer token.

### Login

`POST /api/auth/login` accepts the same `{ password }` payload as today.

1. Compare the submitted password to `AUTH_PASSWORD` and
   `FOOD_ACCESS_PASSWORD` using timing-safe comparison.
2. An owner match creates an `owner` session and returns `{ ok: true, role:
   "owner", redirectTo: "/" }`.
3. A food match creates a `food` session and returns `{ ok: true, role:
   "food", redirectTo: "/food" }`.
4. No match returns the current generic `401 Wrong password` response. It must
   not reveal which credential exists or was attempted.

The login page follows `redirectTo` only when it is a local, role-permitted
path. A food session always lands on `/food`, even when the original request
was an owner-only URL. This avoids an unwanted redirect loop and prevents an
open redirect.

### Session cookie

Replace the current password-valued `auth` cookie with an opaque signed session
cookie named `auth`.

The signed payload is deliberately small:

```ts
type AuthSession = {
  role: 'owner' | 'food'
  issuedAt: number
  expiresAt: number
}
```

It is encoded and HMAC-SHA-256 signed with `AUTH_SESSION_SECRET`. Validation
rejects malformed values, invalid signatures, unknown roles, and expired
sessions. Cookie flags stay `httpOnly`, `secure`, `sameSite: 'strict'`,
`path: '/'`, with the existing one-year expiry.

Store no password in `localStorage`. The current `auth_token` entry is removed
on successful login and no replacement is written. It is not needed for cookie
authentication and retaining it exposes the password to any script running on
the site.

Add `POST /api/auth/logout`, which clears the cookie and redirects the client
to `/login`.

## Authorization

Create a small shared server-side auth module that parses the session once and
exposes `getSession(request)` plus route predicates. The proxy uses it for
early page/API routing. Sensitive route handlers must also call it directly;
proxy protection alone is not the authorization boundary.

### Food-role allowlist

A valid `food` session may access only:

| Path | Purpose |
| --- | --- |
| `/food` and descendants | Shared food UI |
| `/api/food/*` | Shared inventory, barcode, recipe, and shopping endpoints introduced later |
| `/api/auth/logout` | End the restricted session |

Static Next assets remain outside the proxy matcher as today. The food role is
denied every other route, including `/pantry` and all current APIs. Page
requests redirect to `/food`; API requests return JSON `403 Forbidden`.

There are no `/api/food/*` endpoints in this change, so the restricted role
cannot access any data until the food inventory feature is built. The `/food`
page initially contains an authenticated, focused placeholder rather than
repurposing the private `/pantry` route.

### Owner role

A valid `owner` session keeps access to all ordinary authenticated Pantrainer
pages and APIs. The owner can reach `/food` through normal navigation once the
food feature exists. This is how the same shared fridge is accessible from the
normal app without duplicating it.

### Public routes and jobs

These remain independent of browser role sessions:

- `/login` and `/api/auth/login`
- `/api/auth/logout` (it only clears the caller's cookie)
- Next's static assets
- `/api/revalidate`, `/api/automation/*`, and `/api/cron/*`, which retain their
  own existing bearer-secret authorization in their handlers

Unauthenticated `GET /api/photos/*` must be reconsidered separately because it
is unrelated to the food-role change and exposes photo URLs to anyone who knows
them. This design does not widen that existing exception.

## MCP and OAuth

The MCP integration is owner-only. It must not rely on the browser-role proxy
because the current MCP flow uses OAuth bearer tokens rather than the `auth`
cookie.

### Current gap

`/api/mcp` and the OAuth routes are currently public in the proxy, and the MCP
handler does not validate an `Authorization` bearer token itself. The OAuth
authorize page also grants a code without checking an owner session. This
means the existing integration's authorization boundary is weaker than the UI
password boundary.

### Required owner-only MCP flow

1. `/api/oauth/authorize` requires a valid owner browser session before it
   displays or processes the approval form. A food session receives `403`;
   an unauthenticated visitor is redirected to `/login` with the local return
   URL preserved.
2. `/api/oauth/token` validates the signed short-lived code as today and
   returns the existing `AUTOMATION_API_TOKEN`. Its signed authorization code
   can only have originated from an owner-approved request.
3. Every `POST /api/mcp` request validates
   `Authorization: Bearer ${AUTOMATION_API_TOKEN}` in the route handler using
   timing-safe comparison before parsing or dispatching JSON-RPC. Missing or
   invalid credentials return `401`.
4. `OPTIONS` remains public for browser CORS preflight; it performs no work.
   `GET` remains the current `405` response.

The existing connected Claude client continues to send its owner-issued bearer
token, so its tools and behavior do not change. Logging into `/food` in a
separate browser/device cannot grant or use MCP access.

## Routes and navigation

Add a dedicated `/food` route now. It uses the established dark mobile UI but
has no training navigation and no private-data summary. The initial screen
states that shared food inventory will appear there and provides Logout.

The standard mobile navigation remains owner-only. When inventory is built, it
adds one owner navigation link to `/food`; it does not replace `/pantry`.
Food sessions never render `MobileBottomNav`, so they cannot discover private
app routes through navigation.

The direct URL shared with the second person is `/food`. If unauthenticated,
it sends them to `/login`; after entering the food password, the server sends
them back to `/food`.

## Data ownership

No existing Mongo collections are changed by this access-control work.

The future at-home inventory uses its own collection and is globally shared in
this single-household deployment. Existing `pantry` records remain owner-only,
because they store personal calorie-estimation assumptions such as usual grams
and visual cues. The split prevents the term "pantry" from conflating personal
nutrition reference data with a changing household fridge.

When individual accounts/households are justified later, add a `householdId`
to the new food collections and replace password-derived roles with users and
membership. The `/food` UI and `/api/food/*` contract can remain stable.

## Error handling

- Invalid, expired, or tampered session: clear `auth`; redirect pages to
  `/login` and return `401` from APIs.
- Valid food session on an owner page: redirect to `/food`.
- Valid food session on an owner API: return `403`; never redirect an API
  client to HTML.
- Food password missing from environment: no food login can succeed. Deploy
  validation should fail loudly in production rather than accidentally treating
  an absent value as a valid empty password.
- Invalid MCP bearer token: return `401` with no details about the expected
  secret.

## Testing

- Unit test signing/parsing sessions: both roles, expiry, modified payload,
  modified signature, and legacy owner cookie during its migration window.
- Unit test password-to-role selection: owner, food, wrong password, and unset
  food credential.
- Route-level tests for proxy/handler policy: owner allowed everywhere;
  food allowed only on `/food`, `/api/food/*`, and logout; food denied from
  `/pantry`, training/nutrition APIs, MCP, and OAuth approval.
- MCP tests: missing/incorrect bearer gets `401`; valid bearer retains access
  to `tools/list` and an existing safe tool invocation.
- Manual mobile test: visit `/food` in a fresh browser, sign in with food
  password, verify landing page/logout, then attempt private URLs and APIs.
- Regression test: owner login still reaches `/`; existing OAuth connection can
  list MCP tools after the bearer validation change.

## Rollout

1. Generate and configure `AUTH_SESSION_SECRET` and `FOOD_ACCESS_PASSWORD` in
   Vercel before deploying.
2. Deploy the access-control change with the temporary legacy owner-cookie
   migration path.
3. Verify the owner login and existing Claude MCP connection.
4. Open `/food` in a separate mobile browser/profile and verify food-only
   restrictions.
5. Remove legacy password-cookie support after the owner has signed in again.
6. Build the household inventory behind `/food` in a separate change.

## Decisions

- Use two passwords and role sessions now, rather than user accounts.
- Use `/food` for shared at-home inventory and retain `/pantry` for private
  nutrition-estimator staples.
- Make recipe suggestions for food users household-neutral; owner-only future
  recipe suggestions may additionally use training and nutrition context.
- Tighten MCP/OAuth authorization as part of this work, because a food-only
  role is not meaningful if the MCP authorization path can bypass it.
