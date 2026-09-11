const { RefreshToken } = require("../models");
const { signAccessToken, signRefreshToken, hashToken, COOKIE_OPTS } = require("../utils/jwt");

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Issues a brand-new access+refresh cookie pair and stores the refresh
// token's hash. Used both for a fresh login and as the last step of a
// rotation (see rotateSession below).
async function issueSession(user, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
  });

  res.cookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie("refresh_token", refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
}

// Revokes a still-valid refresh token row and issues a fresh pair in its
// place (rotation — each refresh token is single-use). Used by both the
// explicit POST /auth/refresh endpoint and the silent refresh that now
// happens inside attachUser whenever the 15-minute access token has
// expired but the 7-day refresh token hasn't — that silent path is what
// was missing before, which is why sessions died after 15 minutes instead
// of lasting the full 7 days.
async function rotateSession(storedRefreshTokenRow, user, res) {
  storedRefreshTokenRow.revokedAt = new Date();
  await storedRefreshTokenRow.save();
  await issueSession(user, res);
}

module.exports = {
  issueSession,
  rotateSession,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
};
