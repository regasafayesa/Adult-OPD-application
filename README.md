# OPD Monthly Reporting System

## Deployment status

The app uses Supabase Auth and checks facility membership. Every signed-in
facility member can view and manage that facility's encounters, diagnoses, and
settings. Facility membership and role changes remain operator-only.
Local demo mode is temporary and stores changes only in memory; refresh discards
them. Cloud data does not by itself provide backups or audit history.

**Do not use this deployment for real or identifiable patient data.** Before
using real clinical data, the facility must review and validate the deployed
database schema, row-level security, backups, audit requirements, and applicable
privacy and security requirements. Encounter dates, age, sex, and diagnoses are
sensitive health information even when names are not collected.

## Deploy to Vercel

1. Create or select a Supabase project.
2. In Supabase Auth settings, disable public sign-ups. Create staff accounts
   only through a trusted administrator process.
3. Review `supabase/schema.sql` and apply it **once to a new, empty Supabase
   project only**. Do not run it against an existing database. Follow its
   trusted-operator onboarding instructions to create the first facility and
   owner membership. When the diagnosis table for a facility is empty, the
   app reads the approved diagnosis rows already stored for the facility; an
   empty catalog remains empty until a trusted operator loads the approved
   catalog. Authenticated client users cannot create or modify approved
   diagnosis entries or codes.
   For an existing project, apply
   `supabase/migrations/20261011_all_facility_members_full_access.sql` once in
   the Supabase SQL Editor, followed by
   `supabase/migrations/20261015_facility_member_access.sql`. Apply the updated
   20261015 migration even if an earlier version was already applied; it resets
   diagnosis grants so approved codes cannot be edited by authenticated clients.
   Then apply `supabase/migrations/20261022_secure_multifacility_onboarding.sql`
   to add facility registration, invitations, and platform administration. For
   a new project, apply that 20261022 migration after `supabase/schema.sql`.
   Do not rerun the initial schema migration. Every provisioned facility member
   can manage that facility's records, settings, and unofficial diagnosis
   entries; approved diagnosis catalog entries and membership administration
   remain restricted to trusted operators.
4. In the Supabase project API settings, copy the project URL and publishable
   key. Never use a `service_role` key in the browser app.
5. Import this repository into Vercel. The included `vercel.json` configures
   the Vite production build, `dist` output, and SPA rewrites for direct visits
   to app routes.
6. In Vercel **Project Settings → Environment Variables**, add these variables
   for the environments to deploy:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |

   `VITE_` variables are included in the client bundle. The publishable key is
   intended for client use; database security must come from the reviewed
   grants and row-level security policies. Never add a service-role or other
   privileged secret here.
7. Set the Supabase Auth site URL and allowed redirect URLs to the deployed
   Vercel URL and, if used, the production custom domain. Include the login
   route (for example, `https://your-domain/adult-opd/entry`) in allowed
   redirects so password recovery can return to the application.
8. Deploy and verify sign-in, facility access, and direct navigation to app
   routes. Use synthetic data only.

Vercel builds from the repository root using `npm run build`; dependencies
are installed from the committed `package-lock.json`.

## Local development

To try the interface locally without Supabase, install dependencies and start
Vite. When Supabase is not configured, development builds open in local demo
mode; changes are temporary, are not saved to browser storage, and are not
synced. Use synthetic data only.

```sh
npm ci
npm run dev
```

To use Supabase authentication locally, copy `.env.example` to `.env` and fill
in the Supabase project URL and publishable key. `.env` is excluded from Git;
restart Vite after changing it. To use local demo mode even when Supabase
variables are present, set `VITE_LOCAL_DEMO_MODE=true` in `.env.local`.

To verify the production build locally:

```sh
npm run build
npm run preview
```

## Supabase schema and access

The SQL schema creates the facility tables, role policies, and row-level
security rules. It does not seed users, facilities, memberships, or diagnosis
catalog entries. Its opening comments contain the one-time onboarding steps
and explicitly prohibit rerunning it against a non-empty project. Review and
follow those instructions before enabling sign-in for staff.

Signed-in facility data is read from and written to Supabase. The facility ID
comes from the authenticated user's verified membership; database RLS remains
the access boundary. The app can offer an explicit, duplicate-aware import of
legacy browser records, diagnoses, and settings; it does not erase the source
browser data. Only uncoded, unofficial legacy diagnoses can be imported by the
client; code-bearing or approved catalog additions require a trusted operator.
Verify the database operations and configure backups before using clinical data.

Patient entry adds validated encounters to a temporary pending queue. Review,
edit, or remove entries there, then use **Save All to Supabase** to submit
batches of up to 100 encounters per request. Entries remain pending until their
IDs and values are confirmed; an interrupted save is checked against those IDs
before a retry so already-saved encounters are not submitted again.

The ESV-1 catalog is shared through `public.official_diagnoses`; facility
custom diagnoses remain isolated in `public.diagnoses`. Authorized facility
members can read both catalogs under the existing RLS policies. The source
contains repeated identical code/name rows, so generation validates every
source entry against the reviewed catalog before deduplicating. It stops if
there are mismatched names, missing codes, or conflicting database IDs/codes.

Generate and review the insert-only SQL seed, then run it in the Supabase SQL
Editor as a trusted database operator. It never changes or deletes existing
rows and does not target a facility ID.

```powershell
node .\scripts\generate-shared-esv1-import.mjs .\supabase\seed_official_diagnoses.sql
```

Review the generated SQL before running it. After it succeeds, reload the app;
the shared ESV-1 entries will be searchable in every authorized facility.
