# Reminders

A browser-only reminder list styled as a "tideboard": add a message with a date and time, see the list in time
order with the next open reminder highlighted, tick reminders done and clear them. Everything stays in this
browser's localStorage; a fresh browser starts with three sample reminders.

Live: https://reminders.bookchaowalit.com (deployed by Vercel CLI; it can lag `main`, see `PRODUCT.md`).

## What it does not do

- It never alerts you: no browser notifications (no Notification API), no sound, no email. The page says "NO ALERTS".
- No recurring reminders, snooze, priorities, IndexedDB, account or cross-device sync.

## Run

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test           # Vitest: reminder logic, storage store, MCP route, home page render, Sentry scrubbing
npm run lint
npm run typecheck
npm run build
```

CI (`.github/workflows/ci.yml`) runs the shared Node workflow (with a line-coverage gate) and the shared security
scan on every push and PR to `main`.

## Code map

- `lib/reminders.ts`: the starter list, `parseReminders` (validates stored data, falls back to the starter list on
  corrupt storage), time ordering, the next open reminder and the reminder actions used by the page.
- `lib/local-store.ts`: a small localStorage store read with `useSyncExternalStore` (no setState in an effect).
  This repository owns its copy.
- `app/api/mcp/route.ts`: stateless JSON-RPC endpoint with `get_sample_reminders` and `next_reminder`.
- `lib/sentry.ts` + `instrumentation*.ts`: error reporting to Sentry, errors only, personal data stripped; off when
  `NEXT_PUBLIC_SENTRY_DSN` is unset.
- `app/more-projects/page.tsx`: shared portfolio link page (copied per repository, not a package).
