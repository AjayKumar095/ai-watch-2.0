const { AssessmentLock, Assessment, AssessmentSection, SubjectOffering, SubjectPool, Section } = require("../models");

/**
 * A lock is scoped to one (subjectOfferingId, sectionId) pair. SubjectOffering
 * already pins program -> course -> subject -> class -> semester ->
 * admissionYear (+ specialization, if that's modeled as part of the
 * offering); sectionId pins section/sub-section. Together that's the full
 * hierarchy the teacher picks in the lock dialog.
 *
 * Locking does NOT touch Submission or Assessment rows — it only flips a
 * flag that (a) blocks creating new Assessments for that offering, and
 * (b) is a precondition for certificate eligibility. Existing submissions,
 * evaluations, and remarks are completely unaffected either way.
 */

async function getLock({ subjectOfferingId, sectionId }) {
  return AssessmentLock.findOne({ where: { subjectOfferingId, sectionId } });
}

async function isLocked({ subjectOfferingId, sectionId }) {
  const lock = await getLock({ subjectOfferingId, sectionId });
  return !!(lock && lock.isLocked);
}

/**
 * Only the teacher who owns the assessments for this offering may lock it.
 * "Owns" = they authored at least one Assessment against this offering
 * (evaluationController scopes everything by createdById the same way).
 */
async function assertTeacherOwnsOffering({ teacherId, subjectOfferingId }) {
  const owned = await Assessment.findOne({ where: { subjectOfferingId, createdById: teacherId } });
  if (!owned) {
    const err = new Error("You do not have any assessments under this subject offering.");
    err.status = 403;
    throw err;
  }
}

async function lockSection({ teacherId, subjectOfferingId, sectionId }) {
  await assertTeacherOwnsOffering({ teacherId, subjectOfferingId });

  const [lock] = await AssessmentLock.findOrCreate({
    where: { subjectOfferingId, sectionId },
    defaults: { isLocked: true, lockedAt: new Date(), lockedById: teacherId },
  });

  if (!lock.isLocked) {
    lock.isLocked = true;
    lock.lockedAt = new Date();
    lock.lockedById = teacherId;
    lock.unlockedAt = null;
    lock.unlockedById = null;
    await lock.save();
  }
  return lock;
}

async function unlockSection({ teacherId, subjectOfferingId, sectionId }) {
  await assertTeacherOwnsOffering({ teacherId, subjectOfferingId });

  const lock = await getLock({ subjectOfferingId, sectionId });
  if (!lock || !lock.isLocked) return lock; // already unlocked / never locked, nothing to do

  lock.isLocked = false;
  lock.unlockedAt = new Date();
  lock.unlockedById = teacherId;
  await lock.save();
  return lock;
}

/**
 * Bulk version of isLocked for a list of {subjectOfferingId, sectionId}
 * pairs — one query instead of one per pair. Returns a Set of "offeringId:
 * sectionId" keys that are currently locked, for O(1) lookup per pair.
 * Used by the create-assessment page to gray out locked target options
 * up front, instead of letting the teacher pick one and only finding out
 * on submit.
 */
async function lockedKeysForPairs(pairs) {
  const offeringIds = [...new Set(pairs.map((p) => p.subjectOfferingId).filter(Boolean))];
  if (!offeringIds.length) return new Set();

  const locks = await AssessmentLock.findAll({
    where: { subjectOfferingId: offeringIds, isLocked: true },
  });
  const lockedSet = new Set(locks.map((l) => `${l.subjectOfferingId}:${l.sectionId}`));

  // Intersect with the pairs actually asked about, so callers can safely
  // pass a superset of pairs without the result implying locks on
  // combinations nobody queried for.
  const result = new Set();
  for (const p of pairs) {
    const key = `${p.subjectOfferingId}:${p.sectionId}`;
    if (lockedSet.has(key)) result.add(key);
  }
  return result;
}

/**
 * List every (offering, section) pair this teacher has assessments under,
 * annotated with current lock status — feeds the "Lock Assessments" screen.
 */
async function listLockableScopesForTeacher(teacherId) {
  const assessments = await Assessment.findAll({
    where: { createdById: teacherId },
    include: [AssessmentSection],
    attributes: ["id", "subjectOfferingId"],
  });

  if (!assessments.length) return [];
  const offeringIds = [...new Set(assessments.map((a) => a.subjectOfferingId))];

  // Every section an assessment actually targets, straight from
  // AssessmentSection — this is set the moment an assessment is created
  // (assessmentController.create), so a brand-new assessment with zero
  // submissions still shows up here. The previous version only looked at
  // sections that already had a Submission row, which is why freshly
  // created assessments were invisible on this screen until a student
  // submitted something.
  const pairs = [];
  const seen = new Set();
  for (const a of assessments) {
    for (const as of a.AssessmentSections || []) {
      const key = `${a.subjectOfferingId}:${as.sectionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ subjectOfferingId: a.subjectOfferingId, sectionId: as.sectionId });
    }
  }
  if (!pairs.length) return [];

  const locks = await AssessmentLock.findAll({
    where: { subjectOfferingId: offeringIds },
  });
  const lockMap = {};
  locks.forEach((l) => (lockMap[`${l.subjectOfferingId}:${l.sectionId}`] = l));

  // Names are looked up unconditionally — previously these only came through
  // when a lock row already existed, so unlocked pairs fell back to raw
  // UUIDs in the view.
  const offerings = await SubjectOffering.findAll({
    where: { id: offeringIds },
    include: [SubjectPool],
  });
  const offeringMap = {};
  offerings.forEach((o) => (offeringMap[o.id] = o));

  const sectionIds = [...new Set(pairs.map((p) => p.sectionId))];
  const sections = await Section.findAll({ where: { id: sectionIds } });
  const sectionMap = {};
  sections.forEach((sec) => (sectionMap[sec.id] = sec));

  return pairs.map((p) => ({
    subjectOfferingId: p.subjectOfferingId,
    sectionId: p.sectionId,
    subjectOffering: offeringMap[p.subjectOfferingId] || null,
    section: sectionMap[p.sectionId] || null,
    lock: lockMap[`${p.subjectOfferingId}:${p.sectionId}`] || null,
  }));
}

module.exports = {
  getLock,
  isLocked,
  lockedKeysForPairs,
  lockSection,
  unlockSection,
  listLockableScopesForTeacher,
  assertTeacherOwnsOffering,
};
