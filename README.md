# Adult OPD Monthly Reporting System

## Deployment status

The app can be deployed to Vercel for review or testing with synthetic data. It
uses Supabase Auth and checks facility membership, but patient encounters,
diagnoses, and settings are still stored in the browser's local storage. They
are not saved to the Supabase tables, shared between users or devices, or
backed up. Users on the same browser profile may see the same locally stored
records, even after signing out.

**Do not use this deployment for real or identifiable patient data.** A
production clinical deployment requires implementing and validating
server-backed data storage, access controls, backups, and the applicable
privacy and security requirements first. The included Supabase schema does
not, by itself, connect the app's reporting data to Supabase.

## Deploy to Vercel

1. Create or select a Supabase project.
2. In Supabase Auth settings, disable public sign-ups. Create staff accounts
   only through a trusted administrator process.
3. Review `supabase/schema.sql` and apply it **once to a new, empty Supabase
   project only**. Do not run it against an existing database. Follow its
   trusted-operator onboarding instructions to create the first facility and
   owner membership. Import the approved facility diagnosis catalog before
   enabling patient entry.
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
   Vercel URL and, if used, the production custom domain.
8. Deploy and verify sign-in, facility access, and direct navigation to app
   routes. Use synthetic data only.

Vercel builds from the repository root using `npm run build`; dependencies
are installed from the committed `package-lock.json`.

## Local development

Copy `.env.example` to `.env` and fill in the Supabase project URL and
publishable key. `.env` is excluded from Git.

```sh
npm ci
npm run dev
```

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

The Supabase schema's access controls do not change the browser-only storage
used by the current app. Do not treat successful authentication or a
successful deployment as evidence that reporting records are centrally
stored, backed up, or suitable for clinical use.
