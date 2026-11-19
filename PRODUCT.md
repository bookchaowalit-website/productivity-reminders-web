# Reminders — Product truth

> Inferred from the code and copy (no user interview). Checked against the portfolio card claims review
> (`portfolio-site-web/docs/audits/CARD-CLAIMS-REVIEW-2026-10.md`, row `reminders`, evidence Prototype) on 2026-10-23.

## What it is

A client-only list of dated reminders, styled as a tideboard. Reminders live in this browser's localStorage
(key `reminders-v1`). It shows reminders; it never alerts.

## Who it is for

A portfolio visitor, or one person in one browser, who wants a short list of things to keep in view.

## What works today

1. Add a reminder with a message and a date/time (blank messages and a cleared date are refused).
2. The list is ordered by time; "NEXT MARK" shows the earliest reminder that is not done.
3. Tick a reminder done ("LOGGED") or back to open, and clear (delete) it.
4. Changes persist across reloads in this browser. Corrupt or foreign data in the storage key no longer crashes the
   page: it falls back to the starter list and drops malformed entries.
5. `/api/mcp` answers JSON-RPC with `get_sample_reminders` and `next_reminder` (orders reminders the caller sends
   and returns the earliest open one). The server cannot see a visitor's reminders and sends nothing.
6. Front-end and server errors go to Sentry (errors only, personal data stripped) when `NEXT_PUBLIC_SENTRY_DSN` is set.

## What does not work (and must not be claimed)

- No browser notifications or any other alert (no Notification API; the page shows "NO ALERTS"), no recurring
  reminders, snooze or priority levels, no IndexedDB, no cross-device use (claims removed from the portfolio card
  in the 2026-10 review).
- No account, sync or export. Clearing site data removes everything.
- No product analytics beyond Vercel Analytics.

## Known limits

- **Sample reminders follow a clock.** The page dates them from the visitor's device clock and zone when the page
  loads (times appear after hydration). The MCP tool `get_sample_reminders` takes an optional IANA `timeZone` and
  defaults to UTC, so a caller that omits it gets UTC wall-clock times, which can look past-due elsewhere.
- **The past-time hint sits under the whole composer**, not directly under the When field, so on phones it appears
  below the Add button; the field still points to it with `aria-describedby`.

## Live URL and deploy state

- Live: https://reminders.bookchaowalit.com (HTTP 200 on 2026-10-23).
- The Vercel project `bookchaowalit-reminders-frontend` is deployed only by CLI. The last production deploy is the
  CVE patch (2026-10-23 12:28 +07, commit 6611aa5, Next 16.4.2). Its Git link names the old repository
  (`bookchaowalit/bookchaowalit-reminders-frontend`), so a push to `main` does not deploy: the live site lags `main`
  (no Sentry, old template MCP route) until the owner reconnects Vercel Git to this repository (owner action D9).
- `NEXT_PUBLIC_SENTRY_DSN` is set on the Vercel project (Sentry project `productivity-reminders-web`, org
  `personal-yu0`).

## Boundaries

- Browser-only apart from the stateless `/api/mcp` route.
