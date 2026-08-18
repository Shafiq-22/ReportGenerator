# Report Generator

An internal web app for capturing daily job/project progress — activities, issues,
manpower, equipment, materials, photos, and supporting documents — and compiling it
into professional, multi-section PDF reports over any project and date range.

**Stack:** Next.js 15 (App Router) · Vercel · Supabase (PostgreSQL, Auth, Storage, Realtime)

> Single-tenant by design: this is one company's internal tool, so there are no
> organizations or memberships. Access is controlled by a **role on each user's
> profile**, enforced with Row Level Security.

## Documentation

- [`REPORT_GENERATOR_PLAN.md`](REPORT_GENERATOR_PLAN.md) — full product & technical architecture plan.

## Roles

| Role | Can do |
|------|--------|
| **Admin** | Everything: users and roles, company settings, all projects, templates, audit log. |
| **Project Manager** | Create projects, approve daily reports, manage templates, generate reports. |
| **Field User** | Create and edit **their own** daily reports while draft; upload photos and files. |
| **Viewer** | Read-only. |

The first account to sign up automatically becomes the admin, so the system is
usable from a cold start.

## Getting started

### 1. Prerequisites

- Node 22+, pnpm 10+
- [Supabase CLI](https://supabase.com/docs/guides/local-development) and Docker (for local development)

### 2. Install and configure

```bash
pnpm install
cp .env.example .env.local
```

### 3. Start the database

```bash
pnpm db:start          # supabase start — runs Postgres, Auth and Storage locally
```

Copy the printed API URL, anon key and service-role key into `.env.local`, and set
`WORKER_SECRET` to any long random string.

### 4. Run the app

```bash
pnpm dev
```

Open http://localhost:3000 and sign up — the first account becomes the admin.

## Scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |
| `pnpm test:db` | Apply migrations to a throwaway database and assert the RLS policies |
| `pnpm db:start` | Start the local Supabase stack |
| `pnpm db:reset` | Reset the local database and re-apply migrations |
| `pnpm db:types` | Regenerate `lib/supabase/database.types.ts` from the live schema |

## How report generation works

Report builds never run inline in a request:

1. The builder posts a scope (project, date range, sections) and the app inserts a
   `generated_reports` row, a `report_versions` row, and a **queued `report_jobs` row**.
2. A background Vercel function is triggered (`after()`), claims the job atomically,
   and renders the PDF with `@react-pdf/renderer` — pure JS, no headless Chrome.
3. Photos are fetched with **bounded concurrency** and embedded as downscaled images,
   which is what keeps a report with hundreds of photos inside serverless memory limits.
4. Native PDF attachments are appended with `pdf-lib`; Word/Excel files are listed in an index.
5. Progress is written to the job row and streamed to the UI over **Supabase Realtime**.
6. The finished file lands in the private `report-exports` bucket and is delivered
   through a short-lived signed URL.

A **Vercel Cron** sweeper (`/api/cron/sweep`) requeues jobs whose worker died and picks
up any trigger that was lost, giving at-least-once execution without a separate queue
service. The common path never waits for it — `after()` triggers the worker immediately —
so the sweeper only matters for the rare stuck job.

## Deploying to Vercel

The app targets the **Vercel Hobby (free) plan** out of the box. Two things must be true
before a deploy actually works:

**1. Deploy the branch that has the app.** Vercel builds the project's *production
branch* (`main` by default). Make sure the application code is on it — merge the app PR
into `main`, or point the project's production branch (Project → Settings → Git) at the
branch that contains the app. A `main` that only has a README deploys an empty site.

**2. Set the environment variables** (Project → Settings → Environment Variables), for
Production and Preview:

| Variable | Where it comes from |
|----------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (server-only) |
| `WORKER_SECRET` | any long random string you generate |

`NEXT_PUBLIC_SITE_URL` is optional — Vercel derives the URL automatically.

**3. Point it at a Supabase project** with these migrations applied (`supabase db push`,
or the SQL editor). In Supabase → Authentication → URL Configuration, set the Site URL and
add `https://<your-app>.vercel.app/**` to the redirect allow-list.

Without steps 2–3 the site builds but every page returns a 500, because the app throws on
missing configuration by design (see `lib/env.ts`).

### Hobby vs Pro

The defaults are the Hobby-plan maximums so the deploy just works:

| Setting | Hobby default | On Pro |
|---------|---------------|--------|
| Cron sweep (`vercel.json`) | once daily (`0 4 * * *`) | raise to `* * * * *` for a one-minute safety net |
| Worker `maxDuration` (`app/api/worker/report/route.ts`) | `60` s | raise to `300` (enable Fluid Compute) for large, image-heavy reports |

Reports still generate immediately on both plans via the direct `after()` trigger; the Pro
knobs only shorten the fallback window and lift the ceiling on very large reports.

## Environment variables

See [`.env.example`](.env.example). `SUPABASE_SERVICE_ROLE_KEY` and `WORKER_SECRET`
are server-only and must never be exposed to the browser.

## Project layout

```
app/            App Router routes — (auth), (app) shell, and api/ handlers
components/     UI primitives and shared components
features/       Domain features: projects, daily-reports, attachments, reports, templates, settings
lib/            Supabase clients, auth helpers, storage helpers, report engine, validation
supabase/       SQL migrations (source of truth for the schema) and config
tests/          Vitest unit tests
```
