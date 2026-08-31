// Config consumed by sequelize-cli (db:migrate, migration:generate, etc.)
// ONLY — the app itself still connects via src/config/database.js.
//
// Kept in sync with that file on purpose: same env vars, same
// sqlite-dev/postgres-prod switch, same `underscored: true` column
// naming — so a migration written against this config produces exactly
// the tables/columns the models (and the app's own connection) expect.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

function resolveSqliteStorage() {
  const configured = process.env.DB_STORAGE || "dev.sqlite3";
  return path.isAbsolute(configured) ? configured : path.join(__dirname, "..", "..", configured);
}

const sqliteConfig = {
  dialect: "sqlite",
  storage: resolveSqliteStorage(),
  logging: process.env.SQL_LOGGING === "true" ? console.log : false,
  define: { underscored: true },
};

const postgresConfig = {
  dialect: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  logging: process.env.SQL_LOGGING === "true" ? console.log : false,
  define: { underscored: true },
};

const config = (process.env.DB_DIALECT || "sqlite") === "postgres" ? postgresConfig : sqliteConfig;

// sequelize-cli wants one block per NODE_ENV; we use the same resolved
// config for all three since the dialect switch is already env-var driven.
module.exports = {
  development: config,
  test: config,
  production: config,
};
