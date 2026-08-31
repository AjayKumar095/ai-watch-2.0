// Sequelize connection setup.
//
// Dev: SQLite (zero-setup, file-based) — set DB_DIALECT=sqlite (default).
// Prod migration: set DB_DIALECT=postgres and provide DB_HOST/DB_PORT/
// DB_NAME/DB_USER/DB_PASSWORD — no model code changes needed, Sequelize
// abstracts the dialect differences. Run `npx sequelize-cli db:migrate`
// (or the sync path in models/index.js during early development) against
// the new Postgres database once ready to cut over.

const { Sequelize } = require("sequelize");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const dialect = process.env.DB_DIALECT || "sqlite";

// Resolve DB_STORAGE relative to the project root, not the current working
// directory — otherwise launching node from a different folder (a service
// manager, a different terminal cwd, etc.) silently reads/writes a
// different, empty SQLite file.
function resolveSqliteStorage() {
  const configured = process.env.DB_STORAGE || "dev.sqlite3";
  return path.isAbsolute(configured) ? configured : path.join(__dirname, "..", "..", configured);
}
 
let sequelize;

if (dialect === "postgres") {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      dialect: "postgres",
      logging: process.env.SQL_LOGGING === "true" ? console.log : false,
      define: {
        underscored: true, // snake_case columns, matches the Postgres-migration plan
      },
    }
  );
} else {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: resolveSqliteStorage(),
    logging: process.env.SQL_LOGGING === "true" ? console.log : false,
    define: {
      underscored: true,
    },
  });
}

module.exports = sequelize;
