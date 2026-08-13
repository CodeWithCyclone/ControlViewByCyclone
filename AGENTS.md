# AGENTS.md

Architecture notes and conventions for this project, for future agents/humans working on it.

## Why not Netlify Identity

Read `netlify-identity` SKILL.md before touching auth. It was rejected for this project because:

- Roles are limited to `app_metadata.roles` string arrays with no built-in approval workflow —
  there's no "pending" state, and the "first admin" has to be set up by hand in the Netlify UI.
- No first-class device fingerprint / session-duration tracking.
- The mod-vs-admin permission split (mods can approve/notify but not manage other admins) doesn't
  map cleanly onto Identity's role model without a lot of custom glue anyway.

Given that a fair amount of custom backend logic was required regardless, plain Netlify
Functions + Netlify Database ended up simpler than bolting custom logic onto Identity.

## Data model (`db/schema.ts`)

- `users` — username/password hash, `role` (`admin`|`mod`|`user`), optional `customRole` label,
  `status` (`pending`|`approved`|`rejected`), `internetAccess` boolean (the "blocked" toggle).
- `sessions` — opaque random token -> user id, with an expiry. This is the session mechanism (see
  below).
- `devices` — one row per browser fingerprint (from `localStorage`), optionally linked to a user.
  Holds `loginCount`, `lastActiveAt`, `totalActiveSeconds`. A device can exist before a user
  registers (anonymous heartbeat) and gets linked to a user on register/login.
- `site_settings` — single-row table: `maintenanceMode`, `maintenanceNotice`, `contentType`
  (`url`|`html`), `contentPayload`. This is the "active content" record for the User Page iframe.
  `getOrCreateSettings()` in `admin-settings.mts` lazily creates the row on first access instead of
  a migration-time seed, so there's no seed migration to keep in sync with the schema.
- `notifications` — `targetUserId` nullable (null = broadcast). `notification_reads` tracks which
  user has already been shown which notification (heartbeat marks-as-read at delivery time so a
  toast is shown exactly once).

## Session mechanism

Deliberately simple: `POST /api/login` inserts a random 32-byte hex token into `sessions` and sets
it as an httpOnly, `Secure`, `SameSite=Lax` cookie (`session_token`) via `context.cookies`. Every
function that needs the current user calls `getSessionUser(context)` in
`netlify/functions/lib/auth.mts`, which joins `sessions` -> `users` and checks expiry (14 days).
Logout deletes the session row and clears the cookie.

This is simpler than JWT (no secret to manage, trivial server-side revocation via row delete) at
the cost of a DB round-trip per authenticated request — acceptable for this app's scale. Passwords
are hashed with `crypto.scrypt` (salt:hash hex, `,`-free custom format), not bcrypt, since bcrypt
isn't in Node's stdlib and this avoids an extra dependency.

## Device fingerprint approach

`public/js/common.js` generates a `crypto.randomUUID()` on first load and persists it in
`localStorage` under `device_fingerprint`. It is sent as `fingerprint` in the body of
`/api/register`, `/api/login`, and `/api/heartbeat`. This is a stable per-browser identifier, not a
real anti-fraud fingerprint (no canvas/WebGL hashing) — good enough for "how many devices/sessions
does this account have" style tracking, not for abuse resistance.

The `devices` table row is looked up/created by fingerprint on every heartbeat, independent of
login state, so anonymous traffic is tracked too (`userId` stays null until a login/register call
links it).

## Heartbeat is the single polling endpoint

`POST /api/heartbeat` on the User Page does four things in one round trip every 15s (see
`public/user.html`): bump the device's `totalActiveSeconds` by the fixed 15s interval, report
auth/block/pending state, report maintenance state (with admin bypass), and return the current
content record plus any unread notifications (marking them read as they're returned). There is no
separate `/api/notifications` polling endpoint — it would double-consume/race the same
`notification_reads` rows, so heartbeat is the sole delivery path for toasts.

`totalActiveSeconds` increments by a fixed constant per heartbeat rather than wall-clock delta
between heartbeats, since the browser could be backgrounded/suspended; this trades some precision
for simplicity and avoids clock-skew edge cases.

## Role permissions (mod vs admin)

Enforced server-side, not just hidden in the UI (`isAdmin` / `isAdminOrMod` in
`netlify/functions/lib/auth.mts`):

- Both admin and mod: list accounts, approve/reject pending accounts, toggle `internetAccess`,
  send notifications (broadcast or targeted).
- Admin only: create/edit accounts with `role = admin|mod`, change any account's role, delete
  accounts, toggle maintenance mode, change maintenance notice text, change injected content
  (`admin-settings.mts` PATCH; mods get read-only GET).
- `admin-users.mts` PATCH checks both "does this edit touch a privileged account" and "does this
  edit change a role" before allowing a mod through.

## Frontend conventions

- No build step. Plain HTML files in `public/`, one shared `public/js/common.js` (fingerprint +
  `fetch` wrapper) and `public/css/main.css` (dark theme, reused across login/register/admin).
- `public/user.html` intentionally has its own inline `<style>` instead of `main.css` — the spec is
  explicit that this page is fullscreen iframe + status overlay only, so it's kept minimal and
  self-contained rather than pulling in the admin-console stylesheet.
- `netlify.toml` redirects `/login`, `/register`, `/admin`, `/user` to their `.html` files so URLs
  match the spec exactly.
- `public/index.html` is a tiny redirect shim: checks `/api/me` and sends the visitor to `/user.html`
  or `/login.html`.

## Known gaps / follow-ups if this grows

- No password-change or "force password reset" UI — see README's default-admin-password caveat.
- No rate limiting on `/api/login` or `/api/register`.
- `devices` rows are never pruned; a cleanup scheduled function would be a good addition if device
  churn becomes large.
- CSP/sandboxing on the `html` content type relies solely on the iframe `sandbox` attribute in
  `public/user.html` (`allow-scripts allow-same-origin allow-forms allow-popups`) — reduce that list
  further if admin-authored HTML shouldn't be allowed to run scripts at all.
