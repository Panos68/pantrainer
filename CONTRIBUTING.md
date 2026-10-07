# Contributing to PanTrainer

Thanks for helping out! PanTrainer is a self-hosted training log where Claude
acts as the coach through a built-in MCP server. Contributions of all sizes are
welcome — bug fixes, new metrics, integrations, docs, translations.

## Getting set up

```bash
git clone https://github.com/Panos68/pantrainer.git
cd pantrainer
npm install
cp .env.example .env.local   # fill in MONGODB_URI, AUTH_PASSWORD, AUTH_SESSION_SECRET
npm run dev
```

A free MongoDB Atlas cluster works fine for development. You can also try the
UI with no database at all in demo mode — see the README.

## Before opening a PR

```bash
npm run typecheck
npm run lint
npm test
```

CI runs the same commands plus `npm run build`. Tests need no secrets or
database: they are plain `node:assert` scripts (`*.test.ts`) run with `tsx`.

## Ground rules

- **Training and nutrition logic gets a unit test.** Pure functions live in
  `lib/` (progression, load, readiness, recovery, plate math…). Put the logic
  there, test it there, and keep components thin.
- **Never break existing instances.** People run this daily on their own data.
  Schema changes must be additive and optional (`.optional()` / `.default()` in
  `lib/schema.ts`), and no migration may delete or rewrite user data silently.
- **Mirror the app's write paths in MCP tools.** If the app recomputes something
  when a session is saved, an MCP tool that writes the same data must do the
  same, so Claude and the UI never disagree.
- **Integrations stay optional.** Garmin, Renpho and anything new must be
  enabled purely by configuration, and the app must work fully without them.
- **No personal data in the repo** — no real names, health numbers, tokens or
  local paths in code, tests or fixtures.
- **This repo uses Next.js 16.** APIs differ from older versions; check
  `node_modules/next/dist/docs/` before relying on memory.

## AI-assisted contributions

Much of this codebase was written with Claude Code, and AI-assisted PRs are
welcome. You are responsible for what you submit: read the diff, run the
checks, and make sure the PR description explains the change in your own words.

## Reporting bugs and security issues

Use the issue templates for bugs and ideas. Report security problems privately
— see [SECURITY.md](SECURITY.md).
