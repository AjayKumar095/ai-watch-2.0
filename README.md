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
npm run migrate               # creates the schema (see "Database migrations" below)
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
src/config/sequelize-cli.config.js  Same env-driven config, for sequelize-cli
migrations/                Schema migrations (see "Database migrations" below)
src/plugins/mailer/        Email plugin — JSON templates + nodemailer (see "Email plugin" below)
src/models/                One file per model + index.js wiring all associations
src/controllers/           MVC controllers (auth, admin, teacher, student, assessment, evaluation)
src/services/              Business logic kept out of controllers (e.g. mapping conflict check)
src/middleware/             JWT auth + role-gating middleware
src/routes/                 Route files per area, mounted in app.js
src/views/                  EJS templates; views/partials/ holds the shared layout + navbar
public/css/                 Tailwind output (rebuild with npm run build:css after editing src/input.css)
scripts/seed.js             Superadmin + sample academic data (schema comes from migrations, not sync)
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

## Database migrations

Schema changes now go through `sequelize-cli` migrations instead of
`sequelize.sync({ alter: true })`. That matters because on SQLite, `alter`
works by rebuilding the whole table and copying rows back in — a fragile
operation that could silently drop or mangle data you'd edited after
seeding. Migrations change the schema in place, so re-seeding (or just
running the app) never touches structure and never risks your data.

**One-time step, only if you already have a `dev.sqlite3` from before this
change:**
```bash
npm run db:baseline   # marks the existing schema as migrated, touches no data
npm run migrate        # applies anything newer than the baseline
```

**Fresh clone / new environment:** just run `npm run migrate` — the
baseline migration (`migrations/…-baseline-schema.js`) creates every table
from scratch.

**When you change a model** (add a column, new table, etc.):
```bash
npx sequelize-cli migration:generate --name add-foo-to-bar
# hand-write the up()/down() in the generated file using queryInterface
npm run migrate
```

Other scripts: `npm run migrate:status`, `npm run migrate:undo`,
`npm run migrate:undo:all`.

Config: `.sequelizerc` points the CLI at `src/config/sequelize-cli.config.js`,
which reads the same `.env` vars as `src/config/database.js` (same
sqlite/postgres switch, same `underscored: true` column naming) — so a
migration written against it produces exactly the columns the models expect.

## Email plugin (`src/plugins/mailer`)

A small, self-contained mailer: pick a JSON template, hand it data, send.

```js
const { sendTemplateMail } = require("./src/plugins/mailer");
await sendTemplateMail({
  to: user.email,
  template: "welcome",          // src/plugins/mailer/templates/welcome.json, no extension
  data: { firstName: "Alex", loginUrl: "https://..." },
});
```

- **Add a new email kind** by dropping a new `templates/<name>.json` file
  with `subject`, `title`, `subtitle`, `body` (HTML) — `{{token}}` placeholders
  get filled from `data` and HTML-escaped. No code changes needed.
- **Config** lives in `.env`: `MAIL_USER` + `MAIL_APP_PASSWORD` (a Gmail
  [App Password](https://myaccount.google.com/apppasswords), not your normal
  password — needs 2-Step Verification on the account), plus `MAIL_FROM_NAME`.
  Set `MAIL_HOST`/`MAIL_PORT` instead to use a non-Gmail SMTP provider.
- **If unconfigured**, `sendTemplateMail` logs what it would have sent and
  returns `{ skipped: true }` instead of throwing — mail failures never take
  down a request. It's already wired into
  `teacherController.js`'s approve/reject flow (wrapped in try/catch)
  to notify students when their account is approved or rejected.
- **Test your setup:** `npm run mail:test -- you@example.com` (add a
  template name as a second arg to try the others).

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
- Signed object-storage uploads for submissions (currently a plain URL field)
