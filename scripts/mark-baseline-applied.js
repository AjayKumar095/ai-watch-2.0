// One-time helper for databases that already have tables from the OLD
// `sequelize.sync({ alter: true })` workflow (e.g. your current dev.sqlite3).
//
// Problem it solves: the baseline migration (migrations/…-baseline-schema.js)
// runs `createTable` for every model. On a FRESH database that's exactly
// what you want. But on your existing dev.sqlite3, those tables already
// exist — so `npm run migrate` would fail with "table already exists".
//
// This script tells sequelize-cli's bookkeeping table (SequelizeMeta) that
// the baseline migration has already run, WITHOUT touching your actual
// tables or data. Run it once:
//
//   npm run db:baseline
//
// After that, `npm run migrate` will only apply migrations that come AFTER
// the baseline — i.e. your real, future schema changes.
//
// Do NOT run this against a fresh/empty database — just run `npm run migrate`
// there instead, it will create everything from scratch correctly.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const sequelize = require("../src/config/database");

const BASELINE_MIGRATION_NAME = "20260101000000-baseline-schema.js";

async function main() {
  const qi = sequelize.getQueryInterface();

  // Detect "fresh database" vs "existing pre-migrations database" by
  // checking for a table we know the app creates (`users`).
  let hasExistingTables = true;
  try {
    await qi.describeTable("users");
  } catch (err) {
    hasExistingTables = false;
  }

  if (!hasExistingTables) {
    console.log("No existing tables found — this looks like a fresh database.");
    console.log("Just run `npm run migrate` instead; nothing to baseline here.");
    await sequelize.close();
    return;
  }

  // Create sequelize-cli's bookkeeping table if it isn't there yet
  // (same shape sequelize-cli itself uses).
  const tables = await qi.showAllTables();
  if (!tables.includes("SequelizeMeta")) {
    await qi.createTable("SequelizeMeta", {
      name: { type: require("sequelize").DataTypes.STRING, allowNull: false, unique: true, primaryKey: true },
    });
    console.log("Created SequelizeMeta table.");
  }

  const [existing] = await sequelize.query(
    "SELECT name FROM \"SequelizeMeta\" WHERE name = ?",
    { replacements: [BASELINE_MIGRATION_NAME] }
  );

  if (existing.length) {
    console.log(`"${BASELINE_MIGRATION_NAME}" is already marked as applied. Nothing to do.`);
  } else {
    await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (?)', {
      replacements: [BASELINE_MIGRATION_NAME],
    });
    console.log(`Marked "${BASELINE_MIGRATION_NAME}" as applied.`);
    console.log("Your existing tables/data were not touched.");
    console.log("From now on, run `npm run migrate` for future schema changes.");
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("Failed to baseline migrations:", err);
  process.exit(1);
});
