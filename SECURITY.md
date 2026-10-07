# Security policy

PanTrainer stores personal health and training data, so security reports are
taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's
[private vulnerability reporting](https://github.com/Panos68/pantrainer/security/advisories/new)
instead. Include what you found, how to reproduce it, and the impact you expect.
You'll get an acknowledgement within a few days.

## Scope notes for self-hosters

- Each instance has a single owner. Keep `AUTH_PASSWORD` and
  `AUTH_SESSION_SECRET` strong and private; rotating `AUTH_SESSION_SECRET` signs
  everyone out and invalidates outstanding OAuth codes and photo links.
- Prefer passkeys (Settings → Passkeys) and per-purpose API tokens (Settings →
  API tokens) over sharing the password or the legacy `AUTOMATION_API_TOKEN`.
- Revoke any token you suspect has leaked from Settings; it stops working
  immediately.
- Self-hosting behind a reverse proxy? Set `TRUST_PROXY=true` only if the proxy
  overwrites `X-Forwarded-For`; login rate limiting then applies per client IP.
- The "Connect to PanTrainer" consent page names the site that will receive
  access. Only approve hosts you expect (e.g. `claude.ai`) — approving a link
  from anyone else gives that site an access token.
