const { verifyAccessToken } = require("../utils/jwt");
const { User, TeacherProfile, StudentProfile } = require("../models");

// Populates req.currentUser if a valid access token cookie is present.
// Does NOT block the request — use requireAuth/requireRole for that.
async function attachUser(req, res, next) {
  res.locals.currentUser = null;
  const token = req.cookies && req.cookies.access_token;
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findByPk(payload.sub, {
      include: [TeacherProfile, StudentProfile],
    });
    if (user && user.isActive) {
      req.currentUser = user;
      res.locals.currentUser = user;
    }
  } catch (err) {
    // Expired/invalid access token — the login-required middleware below
    // will redirect to /login; the client should retry via /auth/refresh
    // for the common "access token just expired" case (see routes/auth.js).
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
