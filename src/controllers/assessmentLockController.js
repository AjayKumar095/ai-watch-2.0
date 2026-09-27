const { lockSection, unlockSection, listLockableScopesForTeacher } = require("../services/assessmentLockService");

// NOTE: this file is required by routes/teacher.js, which is mounted at
// /teacher in app.js. Every redirect below is therefore relative (no
// "/teacher" prefix), matching the convention every other handler in that
// router already uses (e.g. teacherController redirects to "/dashboard",
// not "/teacher/dashboard").

const ROOT = { label: "Dashboard", url: "/teacher/dashboard" };
const ASSESSMENTS = { label: "Assessments", url: "/teacher/assessments" };
const LOCKS = { label: "Lock Assessments" };

exports.showLocks = async (req, res) => {
  const scopes = await listLockableScopesForTeacher(req.currentUser.id);
  res.render("teacher/assessments/locks", {
    title: "Lock Assessments",
    scopes,
    status: req.query.status || null,
    error: req.query.error || null,
    breadcrumbs: [ROOT, ASSESSMENTS, LOCKS],
  });
};

exports.lock = async (req, res) => {
  const { subjectOfferingId, sectionId } = req.body;
  try {
    await lockSection({ teacherId: req.currentUser.id, subjectOfferingId, sectionId });
    res.redirect("/teacher/assessments/locks?status=locked");
  } catch (err) {
    res.status(err.status || 500).redirect(`/teacher/assessments/locks?error=${encodeURIComponent(err.message)}`);
  }
};

exports.unlock = async (req, res) => {
  const { subjectOfferingId, sectionId } = req.body;
  try {
    await unlockSection({ teacherId: req.currentUser.id, subjectOfferingId, sectionId });
    res.redirect("/teacher/assessments/locks?status=unlocked");
  } catch (err) {
    res.status(err.status || 500).redirect(`/teacher/assessments/locks?error=${encodeURIComponent(err.message)}`);
  }
};
