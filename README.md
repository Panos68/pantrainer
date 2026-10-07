# PanTrainer

**A self-hosted training log where Claude is your coach.** Log strength and conditioning sessions on your phone, pull
recovery data from your Garmin, track food from photos — and let Claude read all of it and plan your next week through
a built-in [MCP](https://modelcontextprotocol.io) server. Your data stays in your own database.

[![CI](https://github.com/Panos68/pantrainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Panos68/pantrainer/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

> Built with [Claude Code](https://claude.com/claude-code). PanTrainer started as one athlete's daily training app and
> is now open for anyone to self-host.

## Why PanTrainer

- **Claude as the coach, not a chatbot bolted on.** Claude connects to your instance over MCP, reads your week, lift
  history, recovery and nutrition, and *proposes* plans you approve in the app. It runs on your own Claude
  subscription — PanTrainer never calls an LLM itself and has no AI bill.
- **Built for hybrid athletes.** Strength and conditioning in one log, with training-load science (ACWR, CTL/ATL/TSB,
  TRIMP/sRPE) instead of just volume counts.
- **Honest progress.** Equipment-aware lift tracking (a dumbbell press never drags down your barbell line), and an
  "exclude from progress" switch for injury or illness days.

## Features

**Training**
- Weekly plan with per-day sessions, supersets, alternatives and planned weights
- Live workout mode: set-by-set logging, rest timer, screen stays awake, **screen flash when rest is over**, works
  **offline** (sets sync when you're back online)
- **Progression targets with reasons** — "Every set hit 5 at 60 kg — add 2.5 kg", "Missed reps — repeat 60 kg",
  automatic deload after 3 stalled sessions
- **PR detection** while you log (heaviest, best e1RM, most reps at a weight)
- **Plate math** for barbell lifts, based on the plates you own

**Progress**
- Estimated 1RM curves per lift, personal records table
- **Structural balance** ratios (bench:deadlift, squat:deadlift, overhead:bench, row:bench)
- **Consistency heatmap** with week streaks
- Lift progression, PMC chart (fitness/fatigue/form), activity trend, weight and body composition, RHR/HRV

**Recovery & nutrition**
- Garmin sync: activity auto-fill, sleep, resting HR, HRV, Body Battery, stress, VO2 max; push strength workouts to
  your watch
- Renpho smart-scale weight and body composition
- Daily readiness check-in and recovery score
- Food photos and notes, analyzed by Claude against your own pantry of staple foods; barcode scanner (OpenFoodFacts)
  and a fridge/freezer/cupboard inventory with expiry-date OCR

**Your data, your instance**
- Passkey sign-in (Face ID / Touch ID / fingerprint), login rate limiting
- Per-purpose API tokens and revocable OAuth connections for Claude
- Import history from **Strong** or **Hevy** (CSV)
- Installable as an app (PWA)

## Quick start

You need a MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) M0 cluster is plenty) — or use
Docker, which includes one.

### Option 1 — Vercel (free, easiest)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPanos68%2Fpantrainer&env=MONGODB_URI,AUTH_PASSWORD,AUTH_SESSION_SECRET,CRON_SECRET&envDescription=MongoDB%20connection%20string%2C%20your%20login%20password%2C%20and%20two%20long%20random%20secrets&envLink=https%3A%2F%2Fgithub.com%2FPanos68%2Fpantrainer%2Fblob%2Fmaster%2F.env.example&project-name=pantrainer&repository-name=pantrainer&stores=%5B%7B%22type%22%3A%22blob%22%7D%5D)

1. Click the button. Vercel forks the repo into your GitHub and creates a private Blob store for photos.
2. Fill in `MONGODB_URI`, `AUTH_PASSWORD`, and two random secrets (`openssl rand -base64 32`) for
   `AUTH_SESSION_SECRET` and `CRON_SECRET`.
3. Open your deployment, sign in, and complete the short setup.

Everything runs on Vercel's free Hobby plan for personal use, including the two daily cron jobs.

### Option 2 — Docker (your own server or NAS)

```bash
git clone https://github.com/Panos68/pantrainer.git && cd pantrainer
cp .env.example .env     # set AUTH_PASSWORD, AUTH_SESSION_SECRET, CRON_SECRET
docker compose up -d
```

Open <http://localhost:3000>. The compose file runs the app, MongoDB, and a small scheduler for the daily jobs; photos
are stored in a Docker volume. Put it behind HTTPS (Caddy, Traefik, Cloudflare Tunnel…) before exposing it to the
internet — sign-in cookies and passkeys require a secure origin.

### Option 3 — Local development

```bash
npm install
cp .env.example .env.local   # at minimum MONGODB_URI, AUTH_PASSWORD, AUTH_SESSION_SECRET
npm run dev
```

### Try it without your own data

Point `MONGODB_URI` at an **empty** database, run `npm run demo:seed` to load 12 weeks of sample training, and set
`DEMO_MODE=true` to get a one-click "Explore the demo" sign-in. The seed script refuses to touch a database that already
holds real data.

## Connecting Claude

Your instance's MCP endpoint is `https://<your-instance>/api/mcp`.

- **claude.ai / Claude desktop / mobile:** Settings → Connectors → *Add custom connector* → paste the URL. Claude sends
  you to your instance to sign in and approve; it gets its own revocable token (see Settings → Connected apps).
- **Claude Code, scheduled jobs, scripts:** create a token in **Settings → API tokens** and send it as
  `Authorization: Bearer <token>`:
  ```bash
  claude mcp add --transport http pantrainer https://<your-instance>/api/mcp --header "Authorization: Bearer pt_…"
  ```

Tools include `get_current_context`, `get_current_week`, `get_lift_history`, `get_strength_summary`,
`submit_proposed_plan`, `submit_proposal_by_date`, `get_garmin_recovery_freshness`, `list_food_photos_for_range`,
`save_nutrition_estimate`, `get_nutrition_summary_for_range`, `save_coach_note`, `get_food_at_home` and
`update_food_inventory`. Claude proposes; you review and apply plans in the app.

## Integrations

Each integration is switched on simply by setting its credentials — the app works fully without any of them.

| Integration | Env vars | Notes |
|---|---|---|
| Garmin Connect | `GARMIN_EMAIL`, `GARMIN_PASSWORD` | Uses the unofficial [`garmin-connect`](https://www.npmjs.com/package/garmin-connect) package. The account must not use MFA. Garmin rate-limits logins; if you see 429s, wait ~24 h. |
| Renpho scale | `RENPHO_EMAIL`, `RENPHO_PASSWORD` | Unofficial API; synced daily. |
| OpenFoodFacts | — | Barcode lookups. `FOOD_PRODUCT_LANGUAGE` picks the product-name language. |

## Configuration

See [`.env.example`](.env.example) for every variable. The essentials:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `AUTH_PASSWORD` | yes | Your sign-in password |
| `AUTH_SESSION_SECRET` | yes | Long random secret for sessions, OAuth codes and photo links |
| `CRON_SECRET` | recommended | Secret the daily jobs authenticate with |
| `BLOB_READ_WRITE_TOKEN` / `STORAGE_DIR` | for photos | Vercel Blob, or a local folder (Docker sets this) |
| `APP_TIMEZONE` | recommended | IANA timezone that defines "today" (default `UTC`) |
| `FOOD_ACCESS_PASSWORD` | no | A second password that can only open the food pages |
| `DEMO_MODE` | no | `true` for a public demo instance |

## Development

```bash
npm run dev        # local server
npm test           # unit tests — no database or secrets needed
npm run typecheck
npm run lint
```

Training logic lives in small, tested modules under `lib/` (progression, strength, load, readiness, recovery, plates,
import). See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## Support the project

PanTrainer is free and open source. If it helps your training, you can support development by sponsoring the project
(see the **Sponsor** button on GitHub), and contributions of code, docs and ideas are very welcome.

## License

[AGPL-3.0](LICENSE). You can use, modify and self-host PanTrainer freely; if you offer a modified version to others as
a service, you must publish your changes under the same license.
