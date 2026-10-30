# Think Inspect — Think Healthcare and Safety

Digital, offline-first replacement for the paper **Equipment-Specific Checklists** and **Master Inspection & Fitness Certificate** for wheelchairs, scoop stretchers, foldable stretchers and stretchers.

## Deploy on Vercel (full app, shared by the whole team)

1. **Import** this repository at https://vercel.com/new. Set **Application Preset** to **Other**; the build settings come from `vercel.json`.
2. In the project's **Storage** tab, add a **Neon (Postgres)** database and connect it to the project. This creates `DATABASE_URL` automatically. This is the only required setting.
3. **Deploy** (or **Redeploy** if you already deployed). The build creates the tables and loads the 331-unit FLS inventory and the three inspectors the first time. Re-deploying never duplicates data.
4. Open the web address. The app asks for the **access code (`9999`)**, then asks who is using the device.

Optional settings under **Settings → Environment Variables**:

| Name | Purpose |
|---|---|
| `ACCESS_CODE` | change the shared password from `9999` |
| `CRON_SECRET` | any random text; turns on the daily reminder job |
| `REMINDER_TO` | who receives the daily reminder email, comma separated |
| `SMTP_URL`, `MAIL_FROM` | the mail server used to send it |

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

Open **http://localhost:4000**. On first start the server creates its own database and imports `FLS Equipment - INDIA.xlsx` (331 units, 22 sites, 7 cities). The app asks for the access code, which is **9999**, then asks who is using the device. Locally it also loads the two paper-sample inspections.

To use it from a phone on the same Wi-Fi, open `http://<your-computer's-IP>:4000`. To install it as an app, choose **Add to Home Screen**. For live development with hot reload, run `npm run dev` and open http://localhost:5173.

To start again from a clean database:

```bash
npm run seed -- --reset
```

### Production

- Set `DATABASE_URL` to a PostgreSQL database. Without it, the app uses an embedded PostgreSQL (PGlite) stored in `server/.data/`.
- Set `ACCESS_CODE` to change the shared password (default `9999`).
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
