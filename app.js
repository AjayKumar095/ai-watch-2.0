const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const validateEnv = require("./src/config/validateEnv");
validateEnv();

const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const session = require("express-session");
const flash = require("connect-flash");

const { attachUser } = require("./src/middleware/auth");
const authRoutes = require("./src/routes/auth");
const teacherRoutes = require("./src/routes/teacher");
const studentRoutes = require("./src/routes/student");
const adminRoutes = require("./src/routes/admin");

const app = express();

// View engine + partial layout support (MVC: views/ holds templates,
// views/partials/ holds shared fragments included via <%- include(...) %>)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));
app.use(expressLayouts);
app.set("layout", "partials/layout");

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "strict" },
  })
);
app.use(flash());

// Populate req.currentUser / res.locals.currentUser from the JWT cookie,
// on every request, before routing.
app.use(attachUser);

app.get("/", (req, res) => {
  if (!req.currentUser) return res.redirect("/login");
  const dashboard = { SUPERADMIN: "/admin/dashboard", TEACHER: "/teacher/dashboard", STUDENT: "/student/dashboard" };
  res.redirect(dashboard[req.currentUser.role] || "/login");
});

app.use("/", authRoutes);
app.use("/teacher", teacherRoutes);
app.use("/student", studentRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).render("error", { title: "Not Found", message: "That page doesn't exist." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.message && (err.code === "LIMIT_FILE_SIZE" || /csv/i.test(err.message))) {
    return res.status(400).render("error", { title: "Upload problem", message: err.message });
  }
  res.status(500).render("error", { title: "Something went wrong", message: "An unexpected error occurred." });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
