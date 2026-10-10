# Adult OPD Monthly Reporting System

## Deploy to Vercel

Import this repository into Vercel and deploy from the repository root. The included `vercel.json` configures the Vite production build, the `dist` output directory, and routing for direct visits to app pages. Vercel installs dependencies from `package-lock.json`.

To verify a production build locally, run:

```sh
npm ci
npm run build
npm run preview
```

## Data and privacy

This is a browser-only app: encounters, diagnoses, and settings are stored in the current browser's local storage. They are not uploaded to Vercel or shared across users or devices, and clearing browser storage can remove them. Deploying the app does not provide authentication, centralized storage, backups, or audit logs. Restrict access to the deployed site as appropriate, and do not enter identifiable or sensitive patient information without an approved, secure data-handling setup.
