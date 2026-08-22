# AI-Watch Assessment Portal — Express + Sequelize + EJS

Re-architected portal: Express (MVC, server-rendered templates + Tailwind),
Sequelize (SQLite for dev, one env-var switch to Postgres for production),
JWT auth (access + refresh, httpOnly cookies), three role-based dashboards
(Superadmin / Teacher / Student).

## Quick start

```bash
npm install
cp .env.example .env        # adjust secrets/DB settings as needed
npm run build:css           # builds public/css/output.css from src/input.css
npm run seed                 # creates the one superadmin + sample data
npm run dev                  # http://localhost:3000
```

Seeded logins (change these in production):
- Superadmin: `admin@aiwatch.local` / `ChangeMe123!`
- Sample teacher: `teacher@aiwatch.local` / `ChangeMe123!`

## Project layout

```
app.js                     Express entry point
src/config/database.js     Sequelize connection (SQLITE now, POSTGRES later via env)
src/models/                One file per model + index.js wiring all associations
src/controllers/           MVC controllers (auth, admin, teacher, student, assessment, evaluation)
src/services/              Business logic kept out of controllers (e.g. mapping conflict check)
src/middleware/             JWT auth + role-gating middleware
src/routes/                 Route files per area, mounted in app.js
src/views/                  EJS templates; views/partials/ holds the shared layout + navbar
public/css/                 Tailwind output (rebuild with npm run build:css after editing src/input.css)
scripts/seed.js             Superadmin + sample academic data
```

## Migrating to PostgreSQL

Set in `.env`:
```
DB_DIALECT=postgres
DB_HOST=...
DB_PORT=5432
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
```
No model code changes needed — `src/config/database.js` picks the dialect from env.
Use `sequelize-cli` migrations for the real cutover rather than `sync()` in production.

## What's implemented

- JWT auth (access + refresh, rotation, httpOnly/sameSite cookies)
- Breadcrumb navigation across admin, teacher, and student pages
- Student onboarding with teacher-approval-request routing (replaces "class in-charge")
- Superadmin: create teacher accounts, map teacher→subject→section (with conflict flag),
  auto-enroll students into a subject offering
- Superadmin CRUD: Schools, Programs + Specializations, Academic Sessions,
  Program Offerings, Sections & Sub-Groups (hierarchical), Subject Pool
  (including CSV file upload + paste-text bulk import), Subject Offerings
  (including bulk-attach one subject across many programs at once)
- Superadmin workflows: Session Clone-Forward (clones offerings/sections/
  subject-offerings/mappings into a new academic session), Promotion engine
  (preview → commit, with per-student exclusion for held-back cases,
  auto-graduates students past their program's final semester), Certificate
  generation (with an eligibility check gating on all assessments evaluated),
  Audit Log viewer (filterable by action)
- Teacher: dashboard, roster (grouped by subject/program/section), pending-approvals
  panel with bulk approve, assessment creation (multi-section + bulk-across-programs),
  duplicate-as-template, submissions view (filter by section), single + bulk evaluate,
  bulk "open submission window" override
- Student: dashboard, assessment detail + submit (link-based; swap for signed
  object-storage upload in production per the architecture report)

## Not yet built

- Admin CRUD for editing/deleting existing records (currently create + list;
  edit/delete follow the same pattern, just not scaffolded yet)
- Real email delivery for credentials/notifications (currently shown on-screen;
  swap in a background job queue + transactional email provider per the
  architecture report §4.2)
- Signed object-storage uploads for submissions (currently a plain URL field)
