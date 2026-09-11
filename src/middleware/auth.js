const { verifyAccessToken, verifyRefreshToken, hashToken } = require("../utils/jwt");
const { User, TeacherProfile, StudentProfile, RefreshToken } = require("../models");
const { rotateSession } = require("../services/sessionService");

// Populates req.currentUser if a valid access token cookie is present —
// and, if it's missing/expired, transparently falls back to the refresh
// token cookie before giving up. Without this fallback, a user got logged
// out (bounced to /login) the moment the 15-minute access token expired,
// even though their refresh token was still good for up to 7 days —
// because nothing ever consumed the refresh token on their behalf.
// Does NOT block the request either way — use requireAuth/requireRole for
// that.
async function attachUser(req, res, next) {
  res.locals.currentUser = null;

  const accessToken = req.cookies && req.cookies.access_token;

  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      const user = await User.findByPk(payload.sub, {
        include: [TeacherProfile, StudentProfile],
      });
      if (user && user.isActive) {
        req.currentUser = user;
        res.locals.currentUser = user;
        return next();
      }
      // Valid token but the user is gone/deactivated — nothing to fall
      // back to, just proceed unauthenticated.
      return next();
    } catch (err) {
      // Expired/invalid/tampered access token — fall through to the
      // refresh-token path below instead of giving up here.
    }
  }

  const refreshToken = req.cookies && req.cookies.refresh_token;
  if (!refreshToken) return next();

  try {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await RefreshToken.findOne({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) return next();

    const user = await User.findByPk(payload.sub, {
      include: [TeacherProfile, StudentProfile],
    });
    if (!user || !user.isActive) return next();

    // Silently rotate: revoke this refresh token, issue a fresh
    // access+refresh pair, and let the request through as authenticated —
    // the user never sees /login as long as the refresh token is valid.
    await rotateSession(stored, user, res);
    req.currentUser = user;
    res.locals.currentUser = user;
  } catch (err) {
    // Invalid/expired/tampered refresh token — nothing to recover here;
    // requireAuth (if this route needs it) will redirect to /login, and
    // the stale cookies get overwritten next time login/refresh succeeds.
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    return res.redirect("/login");
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.currentUser) return res.redirect("/login");
    if (!roles.includes(req.currentUser.role)) {
      return res.status(403).render("error", {
        title: "Forbidden",
        message: "You don't have permission to view this page.",
      });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
