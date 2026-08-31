const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// System-generated temporary password — used for the initial credentials
// sent on approval and for "forgot password" resets. Avoids ambiguous
// characters (0/O, 1/l/I) so it's easy to type by hand, but still has
// enough entropy (12 chars, mixed case + digit + symbol) to be safe as a
// short-lived credential the user is expected to change immediately.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const SYMBOLS = "!@#$%";

function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += CHARS[bytes[i] % CHARS.length];
  }
  // Guarantee at least one symbol so it meets typical "special character" rules.
  const symbolIndex = crypto.randomInt(0, length);
  const symbol = SYMBOLS[crypto.randomInt(0, SYMBOLS.length)];
  return password.slice(0, symbolIndex) + symbol + password.slice(symbolIndex + 1);
}

module.exports = { hashPassword, verifyPassword, generateTempPassword };
