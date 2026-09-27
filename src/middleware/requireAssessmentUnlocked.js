const { isLocked } = require("../services/assessmentLockService");

/**
 * Wired into the "create assessment" route:
 *
 *   router.post("/assessments/new", requireAssessmentUnlocked, assessmentController.create);
 *
 * The create form does NOT submit a bare subjectOfferingId/sectionId pair —
 * it submits req.body.targets, an array of
 * "<subjectOfferingId>:<sectionId>:<specSignature>" strings, because one
 * assessment can target several sections (even across subject offerings)
 * at once. This mirrors exactly how assessmentController.create groups
 * targets, so it checks the lock for every (offering, section) pair the
 * teacher is about to write against — not just a single pair.
 *
 * If ANY targeted section is locked, the whole submission is rejected
 * (nothing is created for the unlocked targets either) — the teacher fixes
 * up their target selection and resubmits, rather than ending up with a
 * partially-created assessment that's missing some of the sections they
 * picked.
 */
module.exports = async function requireAssessmentUnlocked(req, res, next) {
  let targets = req.body.targets || [];
  if (!Array.isArray(targets)) targets = [targets];
  if (!targets.length) return next(); // let normal validation catch a missing/empty target list

  const pairs = [];
  const seen = new Set();
  for (const t of targets) {
    const [subjectOfferingId, sectionId] = t.split(":");
    if (!subjectOfferingId || !sectionId) continue;
    const key = `${subjectOfferingId}:${sectionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ subjectOfferingId, sectionId });
  }

  for (const { subjectOfferingId, sectionId } of pairs) {
    const locked = await isLocked({ subjectOfferingId, sectionId });
    if (locked) {
      // Absolute path from site root: this middleware runs on
      // routes/teacher.js, mounted at /teacher in app.js, so a redirect
      // MUST repeat that prefix — res.redirect("/x") always resolves from
      // the domain root regardless of the router's mount point, it is NOT
      // relative to the mount. (A leading-slash redirect missing this
      // prefix is exactly what caused the earlier 404 on the lock/unlock
      // form posts.)
      return res.status(423).redirect(
        `/teacher/assessments/new?error=locked&subjectOfferingId=${subjectOfferingId}&sectionId=${sectionId}`
      );
    }
  }
  next();
};
