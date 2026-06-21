
# Multi-user QAULE on Lovable Cloud

Today every browser keeps its own copy of the data in IndexedDB (`src/lib/qa/db.ts`), so two computers can never see each other's measurements, templates, or calendar. We'll move all persistence to Lovable Cloud (managed Postgres + auth) and add login. The local IndexedDB code path will be removed; everyone starts fresh and re-imports from Excel into the cloud.

## What changes for the user

- A login screen appears before the app. No public signup — an **admin creates accounts** for staff from inside the app.
- The first user to register becomes the admin automatically (bootstrap). After that, only admins can add new users.
- Once logged in, everyone sees the **same shared data**: machines, templates, measurements, and the QA calendar. Edits made on one computer appear on others (refresh-based; no live websocket sync in v1).
- An "Admin" page lists users, lets the admin invite a new one (email + temporary password) or remove one.
- Existing local data is **not migrated** — re-import Excel files into the cloud.

## What changes under the hood (technical section)

1. **Enable Lovable Cloud** (Supabase-backed). Adds auth + Postgres.
2. **Schema** (one shared dataset, no per-user scoping):
   - `machines` (id text PK, name, kind) — seeded with the 7 current machines (TB1/2/3, IMG1/2/3, CTSIM).
   - `templates` (id uuid, machine_id, name, payload jsonb, updated_at, updated_by).
   - `measurements` (id uuid, machine_id, test_name, value numeric, unit, tolerance jsonb, reference numeric, performed_at, performer, created_by, created_at).
   - `calendar_entries` (id uuid, year int, test_name, performer, scheduled_dates jsonb, scheduled_months jsonb).
   - `profiles` (id uuid → auth.users, display_name, created_at).
   - `user_roles` (user_id, role enum `admin|user`) + `has_role()` security-definer function — per project rules, never store roles on profiles.
   - RLS: all four data tables → `SELECT/INSERT/UPDATE/DELETE` to any `authenticated` user (fully shared). `user_roles` writes restricted to admins via `has_role`. Standard `GRANT`s on every public table.
   - Trigger: on first `auth.users` insert, if `user_roles` is empty → grant `admin`; else grant `user`. Always create a `profiles` row.
3. **Auth UI**:
   - `/auth` route: email + password sign-in only (no public signup form). Uses `supabase.auth.signInWithPassword`.
   - `_authenticated` layout already managed by the integration — move every existing route (`/`, `/imports`, `/visualization`, `/templates/*`) under it.
   - Sign-out button in `AppShell`.
4. **Admin page** `/admin` (gated by `has_role(admin)`):
   - List users (from `profiles` + role).
   - "Add user" form → server function using `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`, then assigns `user` role. Caller authorization checked with `requireSupabaseAuth` + `has_role` (per project rules).
   - "Remove user" → admin server function deletes auth user.
5. **Data layer rewrite**: replace `src/lib/qa/db.ts` (IndexedDB) with `src/lib/qa/cloud.ts` exposing the same function names (`getTemplates`, `saveTemplate`, `getMeasurements`, `saveMeasurements`, `getCalendar`, `saveCalendar`, etc.) but backed by the browser Supabase client. Call sites in `routes/index.tsx`, `routes/imports.tsx`, `routes/visualization.tsx`, `routes/templates.*.tsx` keep working with minimal changes (async stays async). Delete IndexedDB code and the version-bump logic.
6. **Seed**: a migration inserts the 7 machines so they exist for everyone without any client-side seeding.
7. **Bootstrap admin**: since signup is disabled in the UI, we keep `supabase.auth.signUp` available **only on first run** — the auth page detects "no users yet" (via a public RPC `public_has_any_user()` returning bool) and shows a one-time "Create first admin" form; otherwise shows login only.

## Out of scope for this round
- Real-time sync (Supabase Realtime) — refresh to see others' changes.
- Per-user data isolation, per-machine permissions, audit log UI.
- Migrating existing IndexedDB content into the cloud.
- Password reset flow (admin can re-create or update password from `/admin`).

Approve and I'll implement.
