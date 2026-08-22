const { Program, AcademicSession, PromotionBatch, PromotionRecord, StudentProfile, User } = require("../models");
const { previewPromotion, commitPromotion } = require("../services/promotionService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const PROMOTIONS = { label: "Promotions", url: "/admin/promotions" };

exports.list = async (req, res) => {
  const batches = await PromotionBatch.findAll({
    include: [Program, { model: AcademicSession, as: "fromSession" }, { model: AcademicSession, as: "toSession" }, PromotionRecord],
    order: [["executedAt", "DESC"]],
  });
  res.render("admin/promotions/index", { title: "Promotion Batches", batches, breadcrumbs: [ROOT, { label: "Promotions" }] });
};

exports.showPreviewForm = async (req, res) => {
  const [programs, sessions] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  res.render("admin/promotions/new", {
    title: "Preview Promotion", programs, sessions, error: null, preview: null,
    breadcrumbs: [ROOT, PROMOTIONS, { label: "Preview" }],
  });
};

exports.preview = async (req, res) => {
  const { programId, fromSemesterNumber, fromSessionId, toSessionId } = req.body;
  const [programs, sessions] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  const breadcrumbs = [ROOT, PROMOTIONS, { label: "Preview" }];

  if (!programId || !fromSemesterNumber || !fromSessionId || !toSessionId) {
    return res.status(400).render("admin/promotions/new", {
      title: "Preview Promotion", programs, sessions, breadcrumbs, preview: null,
      error: "All fields are required.",
    });
  }

  const preview = await previewPromotion({ programId, fromSemesterNumber: parseInt(fromSemesterNumber, 10), fromSessionId });
  res.render("admin/promotions/new", {
    title: "Preview Promotion", programs, sessions, breadcrumbs, error: null,
    preview: { ...preview, programId, fromSessionId, toSessionId, fromSemesterNumber: parseInt(fromSemesterNumber, 10) },
  });
};

exports.commit = async (req, res) => {
  const { programId, fromSemesterNumber, fromSessionId, toSessionId } = req.body;
  let studentIds = req.body.studentIds || [];
  if (!Array.isArray(studentIds)) studentIds = [studentIds];
  studentIds = studentIds.filter(Boolean); // guard against empty-string values from a form with nothing checked

  if (!studentIds.length) {
    const [programs, sessions] = await Promise.all([
      Program.findAll({ where: { isActive: true } }),
      AcademicSession.findAll({ where: { isActive: true } }),
    ]);
    return res.status(400).render("admin/promotions/new", {
      title: "Preview Promotion", programs, sessions, preview: null,
      error: "No students were selected — nothing was committed. Go back and check at least one student, or the whole batch is a no-op.",
      breadcrumbs: [ROOT, PROMOTIONS, { label: "Preview" }],
    });
  }

  const result = await commitPromotion({
    programId,
    fromSemesterNumber: parseInt(fromSemesterNumber, 10),
    fromSessionId,
    toSessionId,
    studentIds,
    executedById: req.currentUser.id,
  });

  const { AuditLog } = require("../models");
  await AuditLog.create({
    userId: req.currentUser.id, action: "COMMIT_PROMOTION", entityType: "PromotionBatch", entityId: result.batch.id,
    metadata: { promotedCount: result.promotedCount, graduatedCount: result.graduatedCount },
  });

  res.redirect("/admin/promotions");
};
