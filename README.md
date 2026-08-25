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

## Assessment content editor (BlockNote)

Assessment descriptions use a real block-based rich text editor (BlockNote,
via React) instead of a plain textarea:

- `src/client/assessmentEditorEntry.jsx` — the React/BlockNote mount point,
  bundled with esbuild to `public/js/assessmentEditorEntry.{js,css}`.
  Rebuild after editing it: `npm run build:editor`.
- `src/utils/renderBlocks.js` + `src/utils/escapeHtml.js` — the shared
  server-side renderer that turns the stored block JSON into HTML. Used on
  both the teacher submissions view and the student assessment-detail view
  (`assessment.description` is stored as-is via Sequelize's JSON column type).
- `src/middleware/uploadImage.js` — handles in-editor image uploads (pasted/
  dropped images), saving to `public/uploads/assessment-content/` and
  returning `{ success, file: { url } }` as BlockNote's `uploadFile` expects.
- The editor mounts in `src/views/teacher/assessments/new.ejs`; on form
  submit, a small inline script serializes `editor.document` into a hidden
  `descriptionBlocks` input, which the controller `JSON.parse`s before saving.

If you add more places that need to *display* assessment content (e.g. a
future assessment-detail page for teachers), reuse `renderBlocks` the same
way — don't reimplement rendering per view.

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

## Layout & navigation

- Sidebar shell (`src/views/partials/sidebar.ejs`) with role-based nav groups
  (Superadmin/Teacher/Student see different links), active-link highlighting
  driven by `res.locals.currentPath` (set in `app.js`), and icons via the
  Font Awesome CDN. Mobile: hamburger toggle slides the sidebar in/out.
- Tab and drill-down state (Program Workspace's tab/session/semester) lives
  entirely in the URL query string, so reloading the page preserves exactly
  where you were — no client-side state needed.

## Program Workspace (consolidated admin workflow)

`/admin/programs/:id` replaces the old disconnected Program Offerings /
Subject Offerings / Sections tabs with one hub page per program:

- **Overview** — edit name/code/school/total semesters/duration in years,
  activate/deactivate, delete (guarded if dependents exist)
- **Specializations** — add/edit/delete, scoped to this program
- **Semesters, Sections & Subjects** — pick an Academic Session, pick a
  semester number, "enable" it if not yet active (creates the underlying
  ProgramOffering), then manage Sections & Sub-Groups, assign Subjects from
  the pool, and map Teachers to those subjects (with the conflict flag) —
  all in one screen, all for that exact session+semester.

The old standalone `/admin/offerings`, `/admin/subject-offerings`,
`/admin/sections`, `/admin/mappings` pages are still there as read-only
cross-program listings; day-to-day management happens through the workspace.

## Edit / Delete

Schools, Programs, Specializations, Subject Pool, Academic Sessions,
Teachers, Sections, Subject Offerings, and Teacher Mappings all support
edit and/or delete now. Deletes that would orphan dependent records (e.g.
deleting a School that still has Programs) are guarded with a friendly
error instead of a raw foreign-key crash — deactivate instead in those
cases. Teacher deletion additionally checks for existing subject mappings
and approval requests before allowing a hard delete.

## Not yet built

- Admin CRUD for editing/deleting existing records (currently create + list;
  edit/delete follow the same pattern, just not scaffolded yet)
- Real email delivery for credentials/notifications (currently shown on-screen;
  swap in a background job queue + transactional email provider per the
  architecture report §4.2)
- Signed object-storage uploads for submissions (currently a plain URL field)
