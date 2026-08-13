# Admin Control Console & User Page System

A small full-stack app built entirely on Netlify primitives: static HTML/CSS/JS pages, Netlify
Functions for the API, and Netlify Database (Postgres via Drizzle ORM) for storage. No frontend
framework or build step.

## What it does

- **Device tracking**: every browser gets a UUID fingerprint stored in `localStorage`. The server
  tracks login count, last-active time, and cumulative active seconds per device via a 15s heartbeat.
- **Accounts & roles**: `admin`, `mod`, and `user` roles, plus an optional free-text `customRole`
  label. Public registration creates a `pending` account that requires admin/mod approval. Admins can
  also create pre-approved accounts directly from the panel.
- **Admin panel** (`/admin`, admin/mod only):
  - Accounts & Devices: list every account with device stats, toggle internet access, approve/reject
    pending signups, delete accounts (admin only).
  - Content & Maintenance: toggle maintenance mode with a custom notice, and set the single "active
    content" record (`url` or raw `html`) shown in the User Page iframe. Admin-only to change; mods can
    view.
  - Notifications: send a broadcast or user-targeted message that appears as a toast on the User Page.
    Both admins and mods can send.
- **User Page** (`/user` or `/`): renders **only** a fullscreen iframe. Polls `/api/heartbeat` every
  15s to refresh active-time tracking, pull the current content/maintenance state, and check for new
  notifications. Blocked/pending/rejected users and maintenance mode show a message instead of the
  iframe. Admins bypass maintenance mode.

## Tech stack

- Netlify Functions (`netlify/functions/*.mts`) — plain Web `Request`/`Response`, no framework.
- Netlify Database (Postgres) + Drizzle ORM (`db/schema.ts`, `db/index.ts`).
- Static frontend in `public/` — no build step, no bundler.
- Custom session auth: httpOnly signed-cookie session token stored in a `sessions` table, passwords
  hashed with Node's `crypto.scrypt`. (Netlify Identity was evaluated and rejected — see AGENTS.md.)

## Running locally

```bash
npm install
netlify dev
```

`netlify dev` provisions a local/preview database branch automatically and applies migrations in
`netlify/database/migrations/` before serving. No `.env` file is required for the database connection.

### Environment variables

None are required to run — the session mechanism uses a random per-database session table rather
than a JWT secret, so there's no secret to configure. If you later swap to JWT-based sessions, add a
`SESSION_SECRET` env var in the Netlify UI (Project configuration > Environment variables).

## Default admin login

On first use, the app seeds a default admin account automatically (lazily, the first time
`/api/register` or `/api/login` runs):

```
username: *****
password: ********
```

**Change this password immediately after first login.** There is currently no "change password" UI —
the fastest path is to have another admin create a fresh admin account from the panel and delete/rotate
the seeded one, or add a password-update endpoint before going to production.

## Directory layout

```
db/                          Drizzle schema + client
netlify/functions/           API endpoints (see AGENTS.md for the full list)
netlify/database/migrations/ Auto-generated SQL migrations (applied by Netlify on deploy)
public/                      Static frontend (login, register, admin, user pages)
```

See `AGENTS.md` for architecture details and non-obvious decisions.
