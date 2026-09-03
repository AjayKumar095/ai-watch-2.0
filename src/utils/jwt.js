// Defensive dotenv load — jwt.js can end up required before app.js has run
// its own dotenv.config() in some entry points/tools, so load it here too
// (idempotent/harmless if already loaded).
require("dotenv").config();

const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Fail fast with a clear message instead of the opaque
// "secretOrPrivateKey must have a value" error from jsonwebtoken, which
// almost always means .env wasn't created (only .env.example ships).
if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error(
    "Missing JWT_ACCESS_SECRET / JWT_REFRESH_SECRET.\n" +
      "Copy .env.example to .env (cp .env.example .env, or on Windows: copy .env.example .env)\n" +
      "and set real values for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET before starting the server."
  );
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_TTL || "15m" }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_TTL || "7d",
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// Refresh tokens are stored hashed (never plaintext) so a DB leak doesn't
// hand out usable tokens.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const COOKIE_OPTS = {
  httpOnly: true,
  //secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  secure: false,
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  COOKIE_OPTS,
};
