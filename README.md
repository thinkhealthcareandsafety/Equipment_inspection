# Think Inspect — Think Healthcare and Safety

Digital, offline-first replacement for the paper **Equipment-Specific Checklists** and **Master Inspection & Fitness Certificate** for wheelchairs, scoop stretchers, foldable stretchers and stretchers.

## Deploy on Vercel (full app, shared by the whole team)

1. **Import** this repository at https://vercel.com/new. Set **Application Preset** to **Other**; the build settings come from `vercel.json`.
2. In the project's **Storage** tab, add a **Neon (Postgres)** database and connect it to the project. This creates `DATABASE_URL` automatically.
3. Add these under **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `JWT_SECRET` | a long random string (required) |
| `ADMIN_EMAIL` | the first administrator's login email |
| `ADMIN_PASSWORD` | at least 8 characters; change it after signing in |
| `CRON_SECRET` | a random string; enables the daily reminder job |
| `SMTP_URL`, `MAIL_FROM` | optional, to email reminders |

4. **Redeploy.** The build creates the database tables, loads the 331-unit FLS inventory the first time, adds the three inspectors to the Technician list, and creates the administrator. Re-deploying never duplicates data.
5. Sign in as the administrator, then use **Admin → Users** to give each inspector, reviewer and client admin a login.

The browser-only demo (no server, no database) is still available with `npm run build:demo`.

## Run it on your computer

**Windows, easiest:** unzip the folder, then double-click **`Start-Think-Inspect.bat`**. It sends you to the Node.js download page if Node is missing, installs everything on the first run (a few minutes), and opens http://localhost:4000. Keep the black window open while you use the app; closing it stops the app. If the browser opens before the app is ready, wait a few seconds and press Refresh.

**Mac / Linux:** run `./start-mac-linux.sh`.

**Manual steps (any system):**

You need **Node.js 20 or newer** (https://nodejs.org). Then, in this folder:

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Open **http://localhost:4000**. On first start the server creates its own database, imports `FLS Equipment - INDIA.xlsx` (331 units, 22 sites, 7 cities) and creates demo logins. Click any demo account on the sign-in page. The password for every demo account is `Think@2026`.

| Login | Role |
|---|---|
| ashish.dalal@think-hs.demo, shikha.dixit@think-hs.demo, sumit.shah@think-hs.demo | Inspector |
| reviewer@think-hs.demo | Reviewer |
| jll.admin@jll.demo | Client admin (JLL only, read-only) |
| admin@think-hs.demo | Administrator (import, users, audit, templates) |

To use it from a phone on the same Wi-Fi, open `http://<your-computer's-IP>:4000`. To install it as an app, choose **Add to Home Screen**. For live development with hot reload, run `npm run dev` and open http://localhost:5173.

To start again from a clean database:

```bash
npm run seed -- --reset
```

### Production

- Set `DATABASE_URL` to a PostgreSQL database. Without it, the app uses an embedded PostgreSQL (PGlite) stored in `server/.data/`.
- Set `JWT_SECRET` to a long random string. This is required when `NODE_ENV=production`.
- Set `SMTP_URL` (for example `smtps://user:pass@smtp.zoho.in:465`) and `MAIL_FROM` to turn on the daily reminder emails. Reminders run at `REMINDER_CRON` (default `30 8 * * *`, Asia/Kolkata).
- Serve over HTTPS. The camera and offline install need a secure origin.

## Stack

React 19 + TypeScript + Tailwind (installable PWA with a service worker) · IndexedDB (Dexie) for offline storage · Node/Express API · PostgreSQL · jsPDF for on-device PDFs. The rules engine, checklist templates and importer live in `shared/`, so the phone and the server apply exactly the same logic.

I chose PostgreSQL over MongoDB because the client → building → floor → location → asset hierarchy, the audit trail and the roll-up reporting are relational. Inspection documents are still stored as JSONB, so templates can change without database migrations.

## What's where

| Path | Contents |
|---|---|
| `shared/src/templates.ts` | The four checklists as configurable, versioned templates |
| `shared/src/rules.ts` | P/F/M/NA/RECT logic, mandatory remarks, functional-test rule, out-of-service, re-test, due dates |
| `shared/src/importer.ts` | Inventory spreadsheet importer (pure, unit-tested against the real file) |
| `server/src/db.ts` | Database schema (data model) |
| `client/src/lib/pdf.ts` | PDF templates: Master Certificate, checklist, evidence appendix, summary report |
| `client/src/lib/sync.ts` | Offline outbox and sync engine |
| `docs/DATA_MODEL.md` · `docs/ASSUMPTIONS.md` | Data model and assumptions about unclear source data |

Run the tests with `npm test` (rules and importer).
