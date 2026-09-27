# OrderFlow Wholesale Order Workflow Management

OrderFlow is a mobile-first V1 application for receiving, claiming and completing wholesale orders. It uses one Next.js application on Vercel and one Supabase project for PostgreSQL, authentication, private file storage and realtime updates. There is no standalone backend server to run.

## What is included

- Individual employee accounts, Admin and Employee roles, account disabling and per-employee status permissions
- Image, text, or image-plus-text order submission with required Customer / Store Name
- Atomic daily order numbers based on `Pacific/Auckland`, backed by UUID primary keys
- Separate automatic workflow status (`UNASSIGNED`, `IN_PROGRESS`, `COMPLETED`) and manual auxiliary status
- Database-atomic Accept Order, so only one employee can claim an order
- Picking note/photo, Invoice PDF and Ticket photo/PDF with View, Hide, Replace and Delete
- Database-enforced automatic completion and automatic reopening when a required item is removed
- Search by number, customer, employee or original order text; preset and custom date filters
- Daily collapsible order groups, filtered statistics, full activity log and progress indicators
- Supabase Realtime refreshes across active browsers
- Private files with short-lived signed viewing URLs and one-time signed direct uploads
- Responsive English-only UI for iPhone, Android, iPad, Windows and macOS browsers
- Soft order archiving by Admins and retained file/audit metadata

## Architecture

```text
Browser
  ├─ Next.js App Router UI
  ├─ Supabase cookie session
  └─ one-time signed file upload ─────────────┐
                                              │
Vercel Next.js                               │
  ├─ protected pages                         │
  ├─ route handlers and validation           │
  ├─ signed upload/view URL creation          │
  └─ Admin user management                    │
                 │                            │
                 ▼                            ▼
Supabase
  ├─ Auth and employee identities
  ├─ PostgreSQL, RLS, atomic RPC functions and triggers
  ├─ private Storage bucket
  └─ Realtime Postgres Changes
```

The database is the source of truth for concurrency and workflow integrity. The browser cannot manually set `workflow_status`. Order creation, acceptance, file registration/deletion, automatic completion/reopening, priority changes and auxiliary status changes use database functions that also write activity records.

## Prerequisites

- Node.js 20.9 or later
- pnpm 10 or later
- A Supabase project
- A Vercel account for production deployment
- Supabase CLI only if you want the optional fully local Supabase environment

## Fastest setup

### 1. Create the Supabase project

Create a project at Supabase. In **Project Settings > API**, copy:

- Project URL
- Publishable key (or the legacy anon key)
- Secret key (or the legacy service-role key)

The secret/service-role key is server-only. Never expose it with a `NEXT_PUBLIC_` prefix.

In **Authentication > Providers > Email**, turn off public user sign-up. Employee accounts should be created only by an Admin in OrderFlow.

### 2. Apply the database migration

The simplest option is Supabase Dashboard **SQL Editor**:

1. Open [`supabase/migrations/202609260001_initial_schema.sql`](supabase/migrations/202609260001_initial_schema.sql).
2. Copy the entire file into a new SQL query.
3. Run it once.

Alternatively, link the CLI project and run:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migration creates the schema, constraints, private `order-files` bucket, RLS policies, realtime publication entries and database functions.

### 3. Configure the application

```bash
cp .env.example .env.local
pnpm install
```

Fill in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=order-files
NEXT_PUBLIC_APP_URL=http://localhost:3000
BUSINESS_TIMEZONE=Pacific/Auckland
MAX_UPLOAD_BYTES=10485760
```

`BUSINESS_TIMEZONE` documents the application setting; the migration deliberately fixes daily numbering and grouping to `Pacific/Auckland` so browser timezones cannot change business dates.

### 4. Create the first Admin

With `.env.local` configured, run:

```bash
pnpm admin:create -- admin@example.com "A-strong-temporary-password" admin "Admin Name"
```

The Admin can then sign in and create employees from **Users**. Supabase Auth hashes passwords; the application never stores a plain-text password.

### 5. Start locally

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Vercel deployment

1. Put the project in a Git repository and import it in Vercel.
2. Keep the detected framework preset as **Next.js**.
3. Add every value from `.env.local` in **Project Settings > Environment Variables**. Set `NEXT_PUBLIC_APP_URL` to the production HTTPS URL.
4. Deploy. Vercel runs `pnpm build` automatically.
5. In Supabase **Authentication > URL Configuration**, set the Site URL to the Vercel production URL and add `https://YOUR_DOMAIN/auth/callback` to Redirect URLs.
6. Verify login, Send Order, Accept Order, all three processing uploads and realtime updates in two browser sessions.

Preview deployments can use the same development Supabase project, but production should use a dedicated production project.

## File security

- The `order-files` bucket is private; there are no public read policies.
- The server verifies the signed-in active profile and order access before creating upload or view URLs.
- Upload paths use generated UUID filenames, not customer-supplied paths.
- MIME type, section-specific type and size are checked before upload and checked again against stored object metadata before the database registers a file.
- View links expire after 120 seconds.
- Deleted/replaced file records are soft-deleted and no longer receive view URLs. Storage objects are retained for audit/recovery; add a retention job later if permanent erasure becomes a policy requirement.
- Default maximum size is 10 MB per file. Keep Supabase bucket limits and `MAX_UPLOAD_BYTES` aligned if changing it.

## Authentication and permissions

Public signup is disabled in [`supabase/config.toml`](supabase/config.toml). Admins create accounts through the application. Every protected API request verifies the Supabase user and an active profile. Database RLS protects reads, while all important writes go through permission-checking database functions.

Disabling a profile immediately blocks all application API operations, including an already-open session. Supabase project Auth rate limits provide the login-attempt throttle; review **Authentication > Rate Limits** before production and enable CAPTCHA if the login page is exposed to sustained abuse.

## Tests and quality checks

Run the application checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Pure unit tests cover workflow completion/reopening rules, Auckland business dates, order validation and section-specific file validation. The pgTAP file in [`supabase/tests/database.test.sql`](supabase/tests/database.test.sql) checks the critical schema/RPC/RLS surface and can be run with a local Supabase stack:

```bash
supabase start
supabase test db
```

Before production, perform this two-session acceptance test:

1. Sign in as two employees.
2. Create an image/text order and confirm the same daily number appears in both sessions.
3. Click **Accept Order** simultaneously. Confirm exactly one succeeds and the other receives the named conflict message.
4. Upload Picking, Invoice and Ticket. Confirm automatic completion, statistics and activity logs update in both sessions.
5. Delete Ticket. Confirm the order automatically returns to In Progress and the activity log records why.
6. Confirm an Employee cannot open Users and that a disabled employee loses application access.
7. Test on an iPhone-sized viewport and one physical phone, including camera/photo upload.

## Backups and recovery

Use Supabase production backups for PostgreSQL. Select a plan and Point-in-Time Recovery retention that matches the business recovery requirement. Database backups cover orders, profiles, file metadata and activity logs; confirm restore procedures periodically.

Supabase Storage durability is separate from database backup. For stronger recovery, schedule a periodic copy of the private bucket to a second storage location or use an organization backup process. Keep the database and storage snapshots on compatible retention schedules.

## Operational notes

- Orders are never hidden at midnight. The UI collapses non-current dates and keeps them searchable.
- Auxiliary statistics are independent counts and are not added to Total Orders.
- Original text and images are read-only after creation. Internal Order Notes and Picking Notes are separate fields.
- Realtime uses Postgres Changes. RLS still determines which signed-in users can receive records.
- Admin “delete” is implemented as soft archive. Important history remains in the database.
- Invoice generation, inventory, product management, pricing, accounting and push notifications are deliberately outside V1.

## Project structure

```text
src/app/                 Pages and protected route handlers
src/components/          Responsive workflow UI
src/lib/                 Auth, Supabase clients, validation, time and workflow logic
src/types/               Shared domain types
supabase/migrations/     Reproducible PostgreSQL, RLS, Storage and Realtime setup
supabase/tests/          Database contract tests
scripts/create-admin.mjs First-admin bootstrap command
```

## Environment variable reference

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | RLS-limited public API key |
| `SUPABASE_SECRET_KEY` | Server only | User administration and signed Storage operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Legacy fallback for projects without secret keys |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` | Browser and server | Private bucket name, default `order-files`; access still requires signed URLs |
| `NEXT_PUBLIC_APP_URL` | Browser and server | Canonical application URL |
| `BUSINESS_TIMEZONE` | Server | Must stay `Pacific/Auckland` for this deployment |
| `MAX_UPLOAD_BYTES` | Server | File limit, default `10485760` |
