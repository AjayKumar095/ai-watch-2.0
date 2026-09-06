const { Program, AuditLog } = require("../models");
const { cloneYearForward } = require("../services/sessionCloneService");
const { distinctAdmissionYears } = require("../services/admissionYearService");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };

exports.showClone = async (req, res) => {
  const [programs, years] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  res.render("admin/session-clone/new", {
    title: "Clone to New Admission Year", programs, years, error: null, result: null,
    breadcrumbs: [ROOT, { label: "Clone to New Year" }],
  });
};

exports.clone = async (req, res) => {
  const { programId, fromYear, toYear } = req.body;
  const [programs, years] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    distinctAdmissionYears(),
  ]);
  const breadcrumbs = [ROOT, { label: "Clone to New Year" }];

  if (!programId || !fromYear || !toYear) {
    return res.status(400).render("admin/session-clone/new", {
      title: "Clone to New Admission Year", programs, years, breadcrumbs, result: null,
      error: "Program, source year, and target year are all required.",
    });
  }
  if (fromYear === toYear) {
    return res.status(400).render("admin/session-clone/new", {
      title: "Clone to New Admission Year", programs, years, breadcrumbs, result: null,
      error: "Source and target admission year must be different.",
    });
  }

  const summary = await cloneYearForward({
    programId,
    fromYear: parseInt(fromYear, 10),
    toYear: parseInt(toYear, 10),
  });

  await AuditLog.create({
    userId: req.currentUser.id, action: "CLONE_ADMISSION_YEAR", entityType: "Program", entityId: programId,
    metadata: { fromYear, toYear, ...summary },
  });

  res.render("admin/session-clone/new", {
    title: "Clone to New Admission Year", programs, years, breadcrumbs, error: null, result: summary,
  });
};
