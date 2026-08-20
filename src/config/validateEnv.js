// Fails fast with a clear message if required secrets aren't set, instead
// of letting jsonwebtoken/session crash later with a cryptic
// "secretOrPrivateKey must have a value" error.
const REQUIRED = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "SESSION_SECRET"];

function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key] || !process.env[key].trim());
  if (missing.length) {
    console.error("\n❌ Missing required environment variable(s): " + missing.join(", "));
    console.error("   This usually means .env doesn't exist yet (it's not shipped in the zip on purpose).");
    console.error("   Fix:");
    console.error("     Windows (PowerShell/cmd): copy .env.example .env");
    console.error("     macOS/Linux:              cp .env.example .env");
    console.error("   Then open .env and set real values for JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / SESSION_SECRET");
    console.error("   (any long random string works for local dev, e.g. from: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")\n");
    process.exit(1);
  }
}

module.exports = validateEnv;
