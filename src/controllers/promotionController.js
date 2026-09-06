const { Program, PromotionBatch, PromotionRecord, StudentProfile, User, AuditLog } = require("../models");
const { previewPromotion, commitPromotion } = require("../services/promotionService");
const { distinctAdmissionYears } = require("../services/admissionYearService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const PROMOTIONS = { label: "Promotions", url: "/admin/promotions" };

exports.list = async (req, res) => {
  const batches = await PromotionBatch.findAll({
    include: [Program, PromotionRecord],
    order: [["executedAt", "DESC"]],
  });
  res.render("admin/promotions/index", { title: "Promotion Batches", batches, breadcrumbs: [ROOT, { label: "Promotions" }] });
};

exports.showPreviewForm = async (req, res) => {
  const [programs, years] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  res.render("admin/promotions/new", {
    title: "Preview Promotion", programs, years, error: null, preview: null,
    breadcrumbs: [ROOT, PROMOTIONS, { label: "Preview" }],
  });
};

exports.preview = async (req, res) => {
  const { programId, fromSemesterNumber, admissionYear } = req.body;
  const [programs, years] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  const breadcrumbs = [ROOT, PROMOTIONS, { label: "Preview" }];

  if (!programId || !fromSemesterNumber || !admissionYear) {
    return res.status(400).render("admin/promotions/new", {
      title: "Preview Promotion", programs, years, breadcrumbs, preview: null,
      error: "All fields are required.",
    });
  }

  const preview = await previewPromotion({
    programId,
    fromSemesterNumber: parseInt(fromSemesterNumber, 10),
    admissionYear: parseInt(admissionYear, 10),
  });
  res.render("admin/promotions/new", {
    title: "Preview Promotion", programs, years, breadcrumbs, error: null,
    preview: { ...preview, programId, fromSemesterNumber: parseInt(fromSemesterNumber, 10) },
  });
};

exports.commit = async (req, res) => {
  const { programId, fromSemesterNumber, admissionYear } = req.body;
  let studentIds = req.body.studentIds || [];
  if (!Array.isArray(studentIds)) studentIds = [studentIds];
  studentIds = studentIds.filter(Boolean); // guard against empty-string values from a form with nothing checked

  if (!studentIds.length) {
    const [programs, years] = await Promise.all([
      Program.findAll({ where: { isActive: true } }),
      distinctAdmissionYears(),
    ]);
    return res.status(400).render("admin/promotions/new", {
      title: "Preview Promotion", programs, years, preview: null,
      error: "No students were selected — nothing was committed. Go back and check at least one student, or the whole batch is a no-op.",
      breadcrumbs: [ROOT, PROMOTIONS, { label: "Preview" }],
    });
  }

  const result = await commitPromotion({
    programId,
    fromSemesterNumber: parseInt(fromSemesterNumber, 10),
    admissionYear: parseInt(admissionYear, 10),
    studentIds,
    executedById: req.currentUser.id,
  });

  await AuditLog.create({
    userId: req.currentUser.id, action: "COMMIT_PROMOTION", entityType: "PromotionBatch", entityId: result.batch.id,
    metadata: { promotedCount: result.promotedCount, graduatedCount: result.graduatedCount },
  });

  res.redirect("/admin/promotions");
};
