# Report Generator — Product & Technical Architecture Plan

> A production-ready SaaS web app for capturing daily job/project progress and compiling it into professional, sectioned reports.
> **Stack:** Next.js (App Router) on Vercel + Supabase (PostgreSQL, Auth, Storage, Realtime).

**Status:** Planning document (v1). No application code is written yet.
**Author:** Architecture proposal
**Guiding principles:** simplicity, reliability, scalability, and excellent report generation — with minimal third-party dependencies and no over-engineering.

---

## Table of Contents

1. [Product / MVP Scope](#1-product--mvp-scope)
2. [Architecture](#2-architecture)
3. [Database Design](#3-database-design)
4. [Storage Design](#4-storage-design)
5. [Daily Reporting UX](#5-daily-reporting-ux)
6. [Report Builder](#6-report-builder)
7. [Report Generation](#7-report-generation-the-hard-part)
8. [UI Structure](#8-ui-structure)
9. [Security](#9-security)
10. [AI Opportunities](#10-ai-opportunities)
11. [Testing & Deployment](#11-testing--deployment)
12. [Development Roadmap](#12-development-roadmap)
13. [Final Architecture Decision](#13-final-architecture-decision)

---

## 1. Product / MVP Scope

### 1.1 Problem & core value

Field teams (construction, engineering, facilities, inspections, field services) capture daily progress in scattered notes, camera rolls, and spreadsheets. At project close, someone spends days manually assembling a report. **Report Generator turns structured daily entries + media into a compiled, professional report on demand.**

### 1.2 Primary workflows (the product in one breath)

1. **Set up** an organization and a project (job).
2. **Log daily** — each day a field user records progress, activities, issues/delays, manpower, equipment, materials, photos, and supporting files (PDF/Word/Excel/etc.), tagged with dates, location, and comments.
3. **Review** — a manager reviews/approves submitted daily reports.
4. **Compile** — select a project + date range + template, and generate a single professional report (PDF primary, DOCX secondary) that automatically organizes content, photos, and documents into sections.
5. **Deliver** — download or share the versioned report via a signed link.

### 1.3 User roles (keep to four)

| Role | Scope | Can do |
|------|-------|--------|
| **Org Admin / Owner** | Organization | Manage org, members, billing, all projects, templates; everything below. |
| **Project Manager** | Assigned projects | Create/configure projects, review & approve daily reports, build templates, generate reports. |
| **Field User** (foreman/contributor) | Assigned projects | Create/edit own daily reports, upload photos/files, add activities/issues/resources. |
| **Viewer** (client/stakeholder) | Assigned projects | Read-only access to reports and dashboards; no editing. |

> Roles are enforced at the database layer via RLS (Section 9), not just in the UI.

### 1.4 MVP (essential) vs Future

**MVP — must ship:**

- Email/password + magic-link auth; organization creation; invite members.
- Projects CRUD with status, dates, location, client.
- Daily report entry: progress notes, activities, issues, manpower, equipment, materials.
- Photo & document upload (direct-to-Storage, resumable for large files) with captions and tags.
- Drafts + autosave; “copy yesterday”; mobile-friendly entry.
- One default report template; **PDF generation** over a date range with photos + documents organized into sections.
- Async generation with progress + versioned, signed-URL delivery.
- Multi-tenant isolation via RLS; audit logging of key actions.

**Phase 2 — production hardening:**

- Report **Builder** (configurable sections, ordering, filtering, photo layout) and multiple/custom templates.
- **DOCX** export; report versions & regeneration.
- Approvals workflow; per-project membership; org-level branding (logo/colors) on reports.
- Bulk photo tagging; saved filters; dashboard analytics.

**Phase 3 — advanced / differentiators:**

- AI assists (Section 10): daily/period summaries, photo captions, document classification, issue extraction.
- Offline-capable PWA for field entry; client portal for Viewers; scheduled recurring reports; webhooks/exports; e-signature on reports.

### 1.5 Explicit non-goals (avoid scope creep)

No native mobile apps (responsive PWA instead), no built-in chat, no full project-management/Gantt suite, no invoicing/accounting. These are integrations or later bets, not core.

---

## 2. Architecture

### 2.1 Shape of the system

A **single Next.js application** deployed to Vercel is the whole frontend *and* the API/BFF layer. Supabase is the backend platform: Postgres (data + RLS), Auth, Storage, and Realtime. Heavy report generation runs as an **asynchronous background job on Vercel Functions** (Node runtime, extended duration) coordinated through a Postgres jobs table. This keeps the moving parts to exactly two managed platforms.

```mermaid
flowchart TB
    subgraph Client["Client — Browser / Mobile PWA"]
        UI["Next.js React UI<br/>App Router, RSC<br/>shadcn/ui + Tailwind"]
        SW["Service Worker<br/>offline draft cache (Phase 3)"]
    end

    subgraph Vercel["Vercel — Next.js App"]
        RSC["Server Components<br/>+ Server Actions"]
        API["Route Handlers / API<br/>(BFF, authz checks)"]
        WORKER["Background Function<br/>report generation<br/>Node runtime, maxDuration extended"]
        CRON["Vercel Cron<br/>stuck-job sweeper"]
    end

    subgraph Supabase["Supabase"]
        AUTH["Auth<br/>JWT, magic link"]
        PG[("PostgreSQL<br/>data + RLS + jobs table")]
        STG["Storage<br/>photos / documents / exports<br/>resumable (TUS) + signed URLs"]
        RT["Realtime<br/>job progress + collab"]
        EDGE["Edge Functions<br/>light hooks: thumbnails, AI calls"]
    end

    subgraph AI["Optional AI (pluggable)"]
        LLM["LLM / Vision API"]
    end

    UI -->|"HTTPS, Supabase JS<br/>(anon key + user JWT)"| AUTH
    UI -->|read/write via RLS| PG
    UI -->|"direct upload<br/>(signed URL, TUS)"| STG
    UI <-->|"progress subscribe"| RT
    UI --> RSC
    RSC --> API
    API -->|"enqueue job row"| PG
    API -->|"waitUntil() trigger"| WORKER
    CRON -->|"reclaim/retry"| PG
    WORKER -->|"read data (service role)"| PG
    WORKER -->|"fetch images/files"| STG
    WORKER -->|"write PDF/DOCX + version"| STG
    WORKER -->|"update status/progress"| PG
    PG -->|"Postgres changes"| RT
    EDGE -->|"thumbnails on upload"| STG
    EDGE -.->|"optional"| LLM
    WORKER -.->|"optional enrich"| LLM
```

### 2.2 Frontend

- **Next.js App Router** with **React Server Components** for data-heavy reads (dashboards, report previews) and **Server Actions** for mutations, keeping most data access on the server where the service role and validation live.
- **Client state:** TanStack Query for cached lists and optimistic updates; React Hook Form + Zod for forms and validation (schemas shared client/server).
- **UI kit:** Tailwind CSS + shadcn/ui (Radix primitives) — accessible, themeable, no heavyweight design dependency.
- **Auth on the client:** `@supabase/ssr` for cookie-based sessions that work across RSC, Route Handlers, and middleware.
- **Uploads:** browser uploads **directly to Supabase Storage** using signed upload URLs / resumable TUS — files never transit a Vercel function (Section 4).

### 2.3 Backend (Supabase)

- **Postgres** is the source of truth. Business rules that must always hold (tenant isolation, role checks) live in **RLS policies + constraints**, not only in app code.
- **Auth** issues JWTs consumed by both the browser (RLS-scoped anon key) and the server (service role for privileged operations, used only in trusted server code).
- **Storage** holds photos, documents, and generated reports in private buckets with storage RLS.
- **Realtime** streams `report_jobs` progress to the UI and can power light collaboration presence later.
- **Edge Functions (Deno)** are used sparingly for event-driven, low-memory tasks: generating image thumbnails on upload and calling AI providers. They are **not** used for heavy PDF rendering (memory-constrained — see Section 7).

### 2.4 File processing

- **On upload:** client compresses/resizes photos before upload (fast, saves bandwidth); a Storage webhook triggers an Edge Function to generate a normalized **thumbnail** (~1024px long edge) and read EXIF (taken-at, GPS) into the `attachments` row.
- **Documents** (PDF/Word/Excel) are stored as-is; metadata (name, type, size) recorded in Postgres. Optional page-count/preview extraction is deferred.

### 2.5 Background jobs & report generation

- Report builds are **never** run inline in a request. The API inserts a `report_jobs` row and triggers a background worker (`waitUntil()`); the worker generates the file, streams progress into Postgres (→ Realtime → UI), uploads the result, and writes a `report_versions` row. A **Vercel Cron** sweeper reclaims/retries stuck jobs. Full design in Section 7.

---

## 3. Database Design

### 3.1 Principles

- **Single database, shared schema, row-level multi-tenancy** keyed by `org_id` on every tenant-owned table. Simpler and far more scalable operationally than schema-per-tenant; isolation is enforced by **RLS** (Section 9).
- Every table: `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, and (where mutated) `updated_at` maintained by a trigger.
- **Cascade deletes** down the ownership chain (org → project → daily_report → line items/attachments) so tenant deletion is clean.
- **Enums** for small closed sets (roles, statuses, severities); **jsonb** only for genuinely open config (template/section settings, report filters).

### 3.2 Entity overview

```mermaid
erDiagram
    organizations ||--o{ memberships : has
    organizations ||--o{ projects : owns
    profiles ||--o{ memberships : "is"
    projects ||--o{ daily_reports : contains
    daily_reports ||--o{ activities : has
    daily_reports ||--o{ issues : has
    daily_reports ||--o{ manpower : has
    daily_reports ||--o{ equipment : has
    daily_reports ||--o{ materials : has
    daily_reports ||--o{ attachments : has
    projects ||--o{ report_templates : has
    report_templates ||--o{ report_template_sections : has
    projects ||--o{ generated_reports : produces
    generated_reports ||--o{ report_versions : has
    generated_reports ||--o{ report_jobs : "built by"
    organizations ||--o{ audit_logs : records
```

### 3.3 Core tables (representative DDL)

> Illustrative — final columns/constraints firm up during Phase 1. `org_id` repeats on child tables deliberately: it lets **every** RLS policy make a tenant decision from the row itself without a join.

```sql
-- Tenancy & identity ---------------------------------------------------------
create type app_role as enum ('org_admin','project_manager','field_user','viewer');

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_path   text,                       -- Storage path for report branding
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Mirrors auth.users (1:1); populated by a trigger on signup.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_path text,
  created_at  timestamptz not null default now()
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       app_role not null default 'field_user',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on memberships (user_id);
create index on memberships (org_id);

-- Projects -------------------------------------------------------------------
create type project_status as enum ('active','on_hold','completed','archived');

create table projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  code        text,                         -- human job number
  description text,
  client_name text,
  location    text,
  geo         point,                         -- optional lat/lng
  status      project_status not null default 'active',
  start_date  date,
  end_date    date,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on projects (org_id, status);
create unique index on projects (org_id, code) where code is not null;

-- Optional per-project access (Phase 2); org membership is the MVP default.
create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  role       app_role not null default 'field_user',
  primary key (project_id, user_id)
);

-- Daily reports & line items -------------------------------------------------
create type report_status as enum ('draft','submitted','approved','rejected');

create table daily_reports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  report_date  date not null,
  author_id    uuid not null references profiles(id),
  status       report_status not null default 'draft',
  weather      text,
  temperature  numeric,
  summary      text,                        -- free-text progress narrative
  location     text,
  submitted_at timestamptz,
  approved_by  uuid references profiles(id),
  approved_at  timestamptz,
  autosaved_at timestamptz,                 -- drives draft/autosave UX
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, report_date, author_id)   -- one report per author/day/project
);
create index on daily_reports (org_id, project_id, report_date desc);
create index on daily_reports (project_id, status);

create table activities (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  daily_report_id  uuid not null references daily_reports(id) on delete cascade,
  title            text not null,
  description      text,
  category         text,
  percent_complete int check (percent_complete between 0 and 100),
  sort_order       int not null default 0
);
create index on activities (daily_report_id);

create type issue_severity as enum ('low','medium','high','critical');
create type issue_status   as enum ('open','monitoring','resolved');

create table issues (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  daily_report_id  uuid not null references daily_reports(id) on delete cascade,
  title            text not null,
  description      text,
  severity         issue_severity not null default 'medium',
  status           issue_status not null default 'open',
  delay_days       numeric,                 -- schedule impact
  resolved_at      timestamptz,
  sort_order       int not null default 0
);
create index on issues (daily_report_id);
create index on issues (org_id, status) where status <> 'resolved';

-- Resources: manpower / equipment / materials share a shape but stay explicit.
create table manpower (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  trade           text not null,            -- e.g. "Electricians"
  contractor      text,
  headcount       int not null default 0,
  hours           numeric,
  notes           text,
  sort_order      int not null default 0
);
create index on manpower (daily_report_id);

create table equipment (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  name            text not null,
  quantity        int not null default 1,
  hours_used      numeric,
  status          text,                     -- operational / idle / down
  notes           text,
  sort_order      int not null default 0
);
create index on equipment (daily_report_id);

create table materials (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  name            text not null,
  quantity        numeric,
  unit            text,
  supplier        text,
  notes           text,
  sort_order      int not null default 0
);
create index on materials (daily_report_id);

-- Files: ONE polymorphic table for all uploads; photos are attachments
-- with kind='photo' plus image metadata. A `photos` view is provided for
-- convenience. (Rationale in 3.4.)
create type attachment_kind as enum ('photo','document','other');

create table attachments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  daily_report_id uuid references daily_reports(id) on delete cascade, -- null = project-level
  kind            attachment_kind not null default 'other',
  bucket          text not null,            -- 'photos' | 'documents'
  storage_path    text not null,            -- {org}/{project}/{report}/{id}.ext
  thumbnail_path  text,                     -- photos only
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null,
  -- image metadata (nullable; photos only)
  width           int,
  height          int,
  taken_at        timestamptz,
  gps             point,
  caption         text,
  sort_order      int not null default 0,
  uploaded_by     uuid references profiles(id),
  created_at      timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index on attachments (daily_report_id);
create index on attachments (project_id, kind, created_at desc);

create view photos as
  select * from attachments where kind = 'photo';

-- Tags & comments (polymorphic, org-scoped) ----------------------------------
create table tags (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name   text not null,
  color  text,
  unique (org_id, name)
);

create table entity_tags (
  tag_id      uuid not null references tags(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  entity_type text not null,   -- 'daily_report' | 'attachment' | 'project'
  entity_id   uuid not null,
  primary key (tag_id, entity_type, entity_id)
);
create index on entity_tags (entity_type, entity_id);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entity_type text not null,   -- 'daily_report' | 'activity' | 'issue' | 'attachment'
  entity_id   uuid not null,
  author_id   uuid not null references profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on comments (entity_type, entity_id, created_at);

-- Templates & report sections ------------------------------------------------
create type section_type as enum
  ('cover','summary','activities','issues','manpower',
   'equipment','materials','photos','documents','custom');

create table report_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  description text,
  is_default  boolean not null default false,
  config      jsonb not null default '{}',   -- branding, page size, header/footer
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create unique index one_default_template_per_org
  on report_templates (org_id) where is_default;

create table report_template_sections (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references report_templates(id) on delete cascade,
  section_type section_type not null,
  title       text,
  sort_order  int not null default 0,
  config      jsonb not null default '{}',   -- photo grid cols, filters, include flags
  enabled     boolean not null default true
);
create index on report_template_sections (template_id, sort_order);

-- Generated reports, versions & async jobs -----------------------------------
create type job_status as enum ('queued','processing','completed','failed','cancelled');
create type report_format as enum ('pdf','docx');

create table generated_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  template_id uuid references report_templates(id),
  title       text not null,
  date_from   date not null,
  date_to     date not null,
  filters     jsonb not null default '{}',   -- tags, statuses, authors, section overrides
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index on generated_reports (org_id, project_id, created_at desc);

create table report_versions (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  generated_report_id uuid not null references generated_reports(id) on delete cascade,
  version_no          int not null,
  format              report_format not null default 'pdf',
  storage_path        text,                  -- set when completed
  size_bytes          bigint,
  page_count          int,
  checksum            text,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  unique (generated_report_id, version_no, format)
);

create table report_jobs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  generated_report_id uuid not null references generated_reports(id) on delete cascade,
  version_no          int not null,
  format              report_format not null default 'pdf',
  status              job_status not null default 'queued',
  progress            int not null default 0,   -- 0..100 → Realtime progress bar
  params              jsonb not null default '{}',
  error               text,
  attempts            int not null default 0,
  locked_at           timestamptz,              -- worker lease for the cron sweeper
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now()
);
-- Fast "next queued job" and "stuck job" scans:
create index on report_jobs (status, created_at) where status in ('queued','processing');

-- Audit log ------------------------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  actor_id    uuid references profiles(id),
  action      text not null,                 -- 'daily_report.submit', 'report.generate'
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  ip          inet,
  created_at  timestamptz not null default now()
);
create index on audit_logs (org_id, created_at desc);
create index on audit_logs (entity_type, entity_id);
```

### 3.4 Key design decisions

- **One `attachments` table, not separate `photos`/`documents` tables.** Photos are `kind='photo'` rows carrying image metadata (dimensions, EXIF, caption, thumbnail). This avoids duplicated upload/authz/RLS logic and keeps the report builder’s “gather all media for this range” query trivial. A `photos` **view** preserves readable call sites. This is the simplicity-over-cleverness call the brief asks for.
- **Line items keep `org_id`** even though it’s derivable through the parent, so RLS policies never need a join to decide tenancy — a real performance and clarity win.
- **`sort_order` everywhere** the report renders lists, so field users and the builder control ordering without extra tables.
- **Jobs live in Postgres**, giving transactional enqueue, Realtime progress for free, and a trivial cron-based reclaim of stuck work — no external queue.

### 3.5 Indexing summary

- FK columns are indexed; hot read paths use composite indexes: `daily_reports (org_id, project_id, report_date desc)`, `attachments (project_id, kind, created_at desc)`.
- **Partial indexes** where the workload is skewed: open issues, non-default templates, the queued/processing job scan.
- GIN indexes on `jsonb` filter/config columns only if querying inside them proves necessary (default: read whole document).

---

## 4. Storage Design

### 4.1 Buckets (all private)

| Bucket | Contents | Notes |
|--------|----------|-------|
| `photos` | Original site photos + generated thumbnails | Thumbnails at `.../thumb/{id}.webp`. |
| `documents` | PDF / Word / Excel / other supporting files | Stored as-is. |
| `report-exports` | Generated PDF/DOCX report versions | Written by the worker; served via signed URLs. |
| `org-assets` | Org logos / branding used on report covers | Small, referenced by `organizations.logo_path`. |
| `avatars` | User avatars | Optional; small. |

No public buckets. Everything is served through **short-lived signed URLs** minted server-side after an authorization check.

### 4.2 Path convention (stable, ID-based)

```
photos/{org_id}/{project_id}/{daily_report_id}/{attachment_id}.{ext}
photos/{org_id}/{project_id}/{daily_report_id}/thumb/{attachment_id}.webp
documents/{org_id}/{project_id}/{daily_report_id}/{attachment_id}.{ext}
report-exports/{org_id}/{project_id}/{generated_report_id}/v{n}.{pdf|docx}
```

- **The first path segment is always `org_id`**, which is what storage RLS keys on (Section 9.4). Using immutable UUIDs (not filenames) prevents collisions and keeps the original filename purely as display metadata in Postgres.

### 4.3 Metadata

Source of truth for file metadata is the **`attachments` / `report_versions` tables in Postgres**, not Storage object metadata — it’s queryable, joinable, and RLS-protected. The DB row is created in the same flow as the upload so orphans are detectable (a nightly job can reconcile Storage objects lacking a row).

### 4.4 Upload path (large files handled correctly)

- **Direct-to-Storage from the browser.** The server issues a **signed upload URL** (or the client uses the Supabase JS client with the user JWT); bytes go **straight to Storage**, never through a Vercel function — sidestepping serverless body-size and duration limits entirely.
- **Resumable uploads (TUS protocol)** for anything above ~6 MB (large PDFs, high-res photo batches). `tus-js-client` gives pause/resume and network resilience for field users on flaky mobile connections; the resumable endpoint supports very large objects.
- **Client-side pre-compression** of photos (canvas/WebCodecs) before upload to cut bandwidth; a Storage-triggered Edge Function then produces the standardized thumbnail server-side.

### 4.5 Download / access

- All reads use **signed URLs with short TTL** (e.g., 60–300 s for viewing, longer only for an explicit “download” action), generated only after the server confirms the requester’s org membership and role.
- The report worker reads originals via the **service role** and writes exports back to `report-exports`; the finished report is delivered to users as a signed URL to that version.

### 4.6 Lifecycle

- Deleting a `daily_report` cascades in Postgres; a Storage cleanup job (Edge Function on a schedule) removes now-orphaned objects.
- Optional retention rules per org (e.g., archive projects after N months) in Phase 3.

---

## 5. Daily Reporting UX

The daily entry screen is the product’s center of gravity — **it must be fast on a phone, one-handed, in the field, on a bad connection.**

### 5.1 Principles

- **Draft-first with autosave.** A daily report is created as a `draft` on open and autosaved (debounced ~1–2 s) via a Server Action, updating `autosaved_at`. Nothing is ever lost; “Submit” is a separate, deliberate status change.
- **Progressive, sectioned form** on one scrollable page: Summary → Activities → Issues → Manpower/Equipment/Materials → Photos → Documents → Tags/Comments. Each section is collapsible; only Summary is required to save a draft.
- **Repeatable rows** for activities/issues/resources with add/remove and drag-to-reorder (`sort_order`), keyboard- and touch-friendly.

### 5.2 Accelerators

- **“Copy previous day.”** One tap clones the prior day’s manpower/equipment/materials (and optionally activities) into today’s draft — the biggest real-world time saver, since crews and kit change little day to day.
- **Bulk photo upload.** Multi-select from the camera roll; uploads run **in parallel, directly to Storage**, with per-file progress, thumbnails appearing as they land, and inline captioning/tagging afterward. Failed uploads retry (resumable) without redoing the batch.
- **Smart defaults.** Date defaults to today; location/weather prefill from the project and last entry; recently used trades/equipment/materials surface as quick-add chips.
- **Offline drafts (Phase 3).** Service worker + IndexedDB queue entries and photos while offline and sync when connectivity returns.

### 5.3 Mobile-first specifics

- Large tap targets, sticky “Save draft / Submit” bar, native date/number inputs, camera capture via `<input capture>`.
- Optimistic UI (TanStack Query) so edits feel instant; a subtle “Saved” indicator reflects `autosaved_at`.
- Review/approve is a manager desktop flow: a queue of `submitted` reports with inline approve/reject + comment.

---

## 6. Report Builder

The builder turns a project + date range into a configured document definition that the generator renders.

### 6.1 Inputs

- **Scope:** project + `date_from`/`date_to` (or “entire project”).
- **Template:** start from the org default or a saved template; per-report overrides are allowed without mutating the template.
- **Filters:** by tag, author, issue status/severity, or specific daily reports; “include only approved” toggle.

### 6.2 Configurable sections

Sections come from `report_template_sections` and are fully controllable per report:

- **Reorder** via drag-and-drop (`sort_order`).
- **Toggle** sections on/off (`enabled`).
- **Per-section config (`jsonb`):** e.g., photos → grid columns (1–4), captions on/off, group-by day vs activity, max per day; activities → group by category; documents → embed vs link, thumbnail vs list.
- **Photo placement:** inline within the day/activity they belong to, **or** consolidated into a photo-appendix section — a per-section choice.
- **Documents:** attach as an appendix with a linked index, or embed native PDFs inline (see Section 7.4).

### 6.3 Preview & versions

- **Live HTML preview** in the builder renders the exact section model that the PDF/DOCX will use — the same template component tree, so what you see maps to the output.
- **Generate** creates a new `generated_reports` row (first build) and a `report_versions` row per build. Rebuilding after edits produces **v2, v3, …** — nothing is overwritten, giving an auditable history and easy “download previous version.”
- Templates are reusable across projects in the org; “Save as template” captures the current section layout/config.

---

## 7. Report Generation (the hard part)

This is where the product wins or loses, especially for large reports with **hundreds of images and documents** under serverless constraints.

### 7.1 The constraints, named honestly

- **Vercel Functions** (Node runtime, Fluid Compute on Pro) allow extended `maxDuration` (multi-hundred-second) and up to **~4 GB memory** — enough for large reports *if memory is bounded*. Hobby-tier limits are far tighter (~60 s), so production runs on Pro.
- **Supabase Edge Functions** (Deno) are memory-limited (hundreds of MB) — great for thumbnails and AI calls, **wrong** for rendering a several-hundred-image PDF. We deliberately do **not** render reports there.
- **Headless Chrome on serverless** (Puppeteer + `@sparticuz/chromium`) gives pixel-perfect HTML→PDF but has heavy cold starts, high memory, and fragility at scale. We avoid it as the primary path.

### 7.2 Recommended approach

**PDF via `@react-pdf/renderer` (primary), DOCX via the `docx` library (secondary), run in an asynchronous Vercel background Function, coordinated by a Postgres jobs table.** No headless browser, no extra services.

Why:

- `@react-pdf/renderer` is **pure JS** — no Chromium binary, predictable memory, streamable output, and a React component model that maps 1:1 onto our section components. It handles hundreds of images when we feed it **thumbnails, streamed, with bounded concurrency**.
- `docx` is **pure JS** OOXML generation — no browser — so DOCX reuses the same section model.
- Keeping generation in a **Vercel Node function** (not Edge) buys the memory/time headroom large reports need while staying inside the two-platform footprint.

### 7.3 Async pipeline

```mermaid
sequenceDiagram
    participant U as User (Builder)
    participant API as Next.js API (Vercel)
    participant DB as Postgres (report_jobs)
    participant W as Background Worker (Vercel Fn)
    participant S as Supabase Storage
    participant RT as Realtime

    U->>API: POST /reports/generate (scope, template, filters)
    API->>DB: insert generated_reports + report_versions(vN) + report_jobs(queued)
    API-)W: trigger via waitUntil() (background)
    API-->>U: 202 Accepted { jobId }
    U->>RT: subscribe to report_jobs row
    W->>DB: claim job (status=processing, locked_at=now)
    loop per section / per image batch
        W->>S: fetch thumbnails (bounded concurrency)
        W->>W: render section → stream into PDF/DOCX
        W->>DB: update progress %
        DB-)RT: change event
        RT-)U: progress bar updates
    end
    W->>S: upload report-exports/.../vN.pdf
    W->>DB: report_versions.storage_path set; job=completed, progress=100
    DB-)RT: completed
    U->>API: request signed download URL
    API-->>U: signed URL (short TTL)
```

- **Trigger:** the API returns immediately (`202` + `jobId`) and starts the worker with `waitUntil()` so the response isn’t blocked. A **Vercel Cron** (every minute) is the safety net: it reclaims jobs stuck in `processing` past a lease (`locked_at`) and retries `queued` jobs the trigger missed, with capped `attempts`. This gives at-least-once execution without an external queue.
- **Progress:** the worker writes `progress` to the job row; **Supabase Realtime** streams it to the builder’s progress bar. No polling.
- **Delivery:** on completion the client requests a signed URL for the new `report_versions` row and downloads.

### 7.4 Keeping large reports within limits (the important part)

1. **Thumbnails in the body, originals on demand.** Reports embed ~1024px thumbnails (~100–200 KB each), *not* multi-MB originals. Full-res photos are linked (signed URL) or provided as a separate archive. Hundreds of thumbnails stay well within memory and produce a reasonably sized PDF. **This single decision is what makes “hundreds of images” tractable.**
2. **Bounded-concurrency image fetch** (e.g., `p-limit` at 5–10) so we never hold all images in memory at once; buffers are released as sections render.
3. **Stream, don’t buffer.** `@react-pdf/renderer` streams the PDF straight to a Storage upload stream rather than building the whole file in memory.
4. **Chunk enormous reports.** For very large scopes, render **per-section or per-month sub-PDFs** and merge with `pdf-lib`, bounding peak memory regardless of total size. The job model already supports multi-step progress.
5. **Native PDF documents** in the “documents” appendix are **merged with `pdf-lib`** (fast, no rasterization); Word/Excel supporting files are referenced with a linked index rather than converted (conversion would require an office engine we’re intentionally not adding). Optionally, first-page previews can be pre-rendered at upload time in Phase 3.
6. **Idempotent & resumable.** A retried job re-renders the same `version_no` deterministically; partial Storage output is overwritten safely.

### 7.5 When a report is genuinely huge

If a single report would exceed even the extended function window (e.g., thousands of images), the chunked sub-document strategy (7.4.4) keeps each worker invocation bounded and the cron/queue advances the next chunk — so the ceiling scales without introducing a separate worker service. A dedicated container worker (Fly/Railway) remains a **documented escape hatch**, not a day-one dependency.

### 7.6 Format recommendation

- **PDF is the primary deliverable** (fidelity, universality, print).
- **DOCX secondary**, for clients who need to edit — same section model via `docx`.
- **HTML preview** always available in-app (and shareable via signed link later).

---

## 8. UI Structure

Top-level, org-scoped navigation. Each screen described briefly.

- **Dashboard** — per-project snapshot: recent daily reports, open issues, this-week manpower trend, pending approvals, quick “New daily report.” Managers land here.
- **Projects** — list/grid with status, dates, client, last-activity; project detail with tabs (Overview, Daily Reports, Files, Reports, Team, Settings).
- **Daily Reports** — calendar/list of entries for a project; the **entry screen** (Section 5) is the workhorse; review queue for managers.
- **Files** — all photos and documents for a project, filterable by date/tag/kind; grid gallery for photos with lightbox + bulk caption/tag; table for documents. Backed by the single `attachments` model.
- **Reports** — the **Report Builder** (Section 6): configure → live preview → generate; plus a history of `generated_reports` with their versions and download/regenerate actions and live job progress.
- **Templates** — manage `report_templates` and their sections; drag-to-order, per-section config, set org default, “Save as template.”
- **Settings** — Organization (name, logo/branding for reports), Members & roles (invites, role changes), Project defaults, Tags, Audit log viewer, Account/profile.

Cross-cutting: global project switcher, command palette (Phase 2), responsive layouts everywhere with the daily entry screen tuned mobile-first.

---

## 9. Security

### 9.1 Multi-tenancy model

**Single Postgres database, shared schema, isolation by `org_id` enforced with Row-Level Security.** Every tenant table carries `org_id`; **RLS is ON for all of them**; the browser only ever uses the anon key + the user’s JWT, so a user physically cannot read another org’s rows even with a crafted query. The service role key is used **only** in trusted server code (Server Actions, the worker) and never shipped to the client.

### 9.2 Membership & role helpers

```sql
-- Orgs the current user belongs to (SECURITY DEFINER, STABLE).
create or replace function auth_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid()
$$;

-- Role check within an org.
create or replace function has_org_role(target_org uuid, roles app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org and role = any(roles)
  )
$$;
```

### 9.3 Example RLS policies

```sql
alter table daily_reports enable row level security;

-- Read: any member of the owning org.
create policy dr_select on daily_reports
  for select using (org_id in (select auth_org_ids()));

-- Insert: field_user+ , author must be self.
create policy dr_insert on daily_reports
  for insert with check (
    org_id in (select auth_org_ids())
    and author_id = auth.uid()
    and has_org_role(org_id,
      array['field_user','project_manager','org_admin']::app_role[])
  );

-- Update: author while draft, or managers/admins anytime.
create policy dr_update on daily_reports
  for update using (
    org_id in (select auth_org_ids())
    and (
      (author_id = auth.uid() and status = 'draft')
      or has_org_role(org_id, array['project_manager','org_admin']::app_role[])
    )
  );
```

The same pattern applies to line-item tables (decide from their own `org_id`) and to `viewer` being read-only (no insert/update/delete policies granted).

### 9.4 Storage security

- All buckets **private**; storage RLS keys on the first path segment = `org_id`:

```sql
create policy "org members read photos"
on storage.objects for select using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1]::uuid in (select auth_org_ids())
);
-- analogous insert/update/delete policies, gated by role where relevant.
```

- Downloads are **signed URLs with short TTLs**, minted only after a server-side authz check; the worker uses the service role to read originals and write exports.

### 9.5 Auditability

- `audit_logs` records security-relevant actions (submit/approve daily report, generate/download report, member/role changes, deletions) with actor, entity, metadata, and IP — written from server code so it can’t be bypassed by the client.
- Postgres `updated_at` triggers + version history (`report_versions`) give change traceability on the data that matters.

### 9.6 Application-layer hygiene

- Zod validation on every mutation (shared client/server); Server Actions and Route Handlers re-check role even though RLS is the backstop (defense in depth).
- CSRF handled by Next.js Server Actions; secrets only in server env; least-privilege API keys; rate-limit auth and generation endpoints; log and alert on advisor warnings (`supabase get_advisors`) in CI.

---

## 10. AI Opportunities

**The core product is fully functional without any AI.** AI is layered on as optional enrichment behind feature flags, invoked from Edge Functions or the worker, and always with a human in the loop. Where it genuinely helps:

| Opportunity | Where | Value | Guardrail |
|-------------|-------|-------|-----------|
| **Period summaries** | Report build | Draft an executive summary / weekly rollup from daily narratives + issues. | Editable draft, never auto-published; clearly labeled AI-generated. |
| **Photo captions/descriptions** | On upload (Edge Fn, vision) | Auto-suggest captions and alt text for hundreds of site photos → huge time saver + accessibility. | Suggestions only; user can accept/edit; batch, rate-limited. |
| **Document classification** | On upload | Auto-tag a file as RFI / invoice / drawing / spec to route it into the right report section. | Confidence threshold; falls back to “document”. |
| **Issue/delay extraction** | Daily entry / build | Surface likely issues or schedule impacts from free-text notes. | Proposes structured `issues` rows for confirmation. |
| **Semantic search** (Phase 3) | Files/Reports | “Show all electrical delays in March” via `pgvector` embeddings. | Additive; keyword search remains. |

Design rules: AI outputs are **suggestions stored alongside** human fields (never overwriting), the provider is **pluggable** (one interface, swappable model), calls are **async and rate-limited**, and everything degrades gracefully to the manual path if AI is disabled or unavailable.

---

## 11. Testing & Deployment

### 11.1 Pipeline (GitHub → Vercel → Supabase)

```mermaid
flowchart LR
    Dev["Feature branch"] --> PR["Pull Request"]
    PR --> CI["GitHub Actions<br/>lint · typecheck · unit · migration check"]
    PR --> Preview["Vercel Preview Deploy"]
    Preview --> SBBranch["Supabase Branch DB<br/>(isolated, migrations applied)"]
    CI --> E2E["Playwright E2E<br/>against preview"]
    E2E --> Merge["Merge to main"]
    Merge --> Prod["Vercel Production"]
    Merge --> Migrate["Supabase migrations<br/>applied to prod"]
```

### 11.2 Environments

- **Local:** `supabase start` runs the full stack (Postgres, Auth, Storage) in Docker; app runs against it. Deterministic seed script.
- **Preview:** every PR gets a Vercel preview + a **Supabase branch database** with migrations applied — real isolated data to test against.
- **Production:** Vercel production + the primary Supabase project.

### 11.3 Migrations

- **Supabase CLI migrations** are the single source of truth for schema, checked into git and **applied in CI**, never hand-edited in the dashboard. A CI step diffs the migration state to catch drift; `supabase gen types typescript` keeps end-to-end TypeScript types in sync.

### 11.4 Testing layers

- **Unit:** Vitest for section-model builders, filters, the report definition, Zod schemas.
- **Integration:** the async job pipeline and **RLS policies** — tests that assert cross-org reads/writes are denied (security is tested, not assumed).
- **E2E:** Playwright covering the two critical journeys — *daily entry with photo upload* and *generate a report end-to-end* (enqueue → progress → signed download), run against the preview deploy.
- **Report generation smoke test:** a fixture project with a few hundred seeded photos to guard memory/time regressions in the worker.

### 11.5 CI/CD specifics

- GitHub Actions: install → lint (ESLint) → typecheck (`tsc`) → unit → migration validate → Playwright (preview) → Supabase advisors check. Merges to `main` promote the Vercel production deploy and apply prod migrations. Secrets in GitHub/Vercel/Supabase env stores; nothing in the repo.

---

## 12. Development Roadmap

### Phase 1 — MVP (foundations + one great path) — ~6–8 weeks
Auth & orgs & memberships (RLS from day one) → Projects → **Daily report entry** (drafts/autosave, activities/issues/resources) → **Direct-to-Storage photo/doc upload** with thumbnails → default template → **async PDF generation** with progress + versioned signed delivery → audit logging → CI/CD, migrations, preview envs, core E2E.
**Exit criteria:** a user can log a week of daily reports with photos and generate a clean multi-section PDF over a date range.

### Phase 2 — Production (configurability + polish) — ~6–8 weeks
**Report Builder** (section ordering/config, filters, photo placement) → multiple/custom templates → **DOCX** → report versions/regeneration → approvals workflow → per-project membership → org branding on reports → Files gallery with bulk tag/caption → dashboard analytics → hardened RLS test suite, rate limiting, monitoring.

### Phase 3 — Advanced (differentiators) — ongoing
AI assists (summaries, captions, classification, issue extraction) behind flags → offline PWA field entry → client/Viewer portal → scheduled/recurring reports → semantic search (`pgvector`) → e-signature, webhooks/exports, retention policies.

---

## 13. Final Architecture Decision

**Recommended, committed choices (not a menu):**

- **Stack:** **Next.js (App Router, RSC + Server Actions) on Vercel** + **Supabase (Postgres, Auth, Storage, Realtime)**; **Tailwind + shadcn/ui**; TanStack Query + React Hook Form + Zod; `@supabase/ssr` for sessions. Two managed platforms, nothing else required to run.
- **Schema approach:** **Single database, shared schema, `org_id` on every tenant table, isolation enforced by RLS.** One polymorphic `attachments` table (photos = `kind='photo'` + image metadata) with a `photos` view. Small closed sets as enums; open config as `jsonb`. Jobs and versions modeled in Postgres.
- **Storage strategy:** **Private buckets, ID-based paths prefixed by `org_id`, direct-to-Storage uploads (resumable TUS for large files), signed URLs for all access.** File metadata lives in Postgres; thumbnails power the report body.
- **Report generation:** **Asynchronous background jobs on Vercel Node Functions**, state in a Postgres `report_jobs` table, progress via Realtime, output to `report-exports`. **`@react-pdf/renderer` for PDF (primary), `docx` for DOCX (secondary)** — pure-JS, no headless Chrome. Large reports stay bounded via **thumbnails-in-body**, bounded-concurrency image fetch, streaming, and **`pdf-lib` chunked merge**; a Vercel Cron sweeper guarantees at-least-once completion. No external render service.
- **Repository structure:** a **single Next.js app repo** (no premature monorepo):

```
report-generator/
├─ app/                 # App Router routes (dashboard, projects, reports, ...)
│  ├─ (auth)/
│  ├─ (app)/            # org-scoped authenticated shell
│  └─ api/              # route handlers: uploads-signing, reports/generate, worker
├─ components/          # UI (shadcn) + feature components
├─ features/            # daily-reports, files, report-builder, templates (domain logic)
├─ lib/
│  ├─ supabase/         # server & browser clients, typed queries
│  ├─ reports/          # section model, @react-pdf & docx renderers, pdf-lib merge
│  └─ validation/       # shared Zod schemas
├─ supabase/
│  ├─ migrations/       # SQL migrations (source of truth)
│  ├─ functions/        # Edge Functions: thumbnails, ai-*
│  └─ seed.sql
├─ tests/               # vitest unit + playwright e2e (incl. RLS + generation smoke)
├─ .github/workflows/   # CI: lint, typecheck, test, migrate, e2e, advisors
└─ REPORT_GENERATOR_PLAN.md
```

**Why this wins:** it keeps the operational surface to Vercel + Supabase, pushes correctness into the database (RLS + constraints) where it can’t be bypassed, and solves the one genuinely hard problem — compiling hundreds of photos and documents into a professional report — with a pure-JS, memory-bounded, asynchronous pipeline that scales by chunking rather than by adding infrastructure. Simplicity and reliability first; excellent report generation as the headline capability.
