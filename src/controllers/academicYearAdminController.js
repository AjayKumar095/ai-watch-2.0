const { AcademicYear, StudentProfile, AuditLog } = require("../models");
const logger = require("../utils/logger");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };

exports.list = async (req, res) => {
  const years = await AcademicYear.findAll({
    order: [["yearStart", "DESC"]],
  });

  // Attach student count for each year
  const yearsWithCounts = await Promise.all(
    years.map(async (y) => {
      const studentCount = await StudentProfile.count({
        where: { admissionYear: y.admissionYear },
      });
      return {
        ...y.toJSON(),
        studentCount,
      };
    })
  );

  res.render("admin/academic-years/index", {
    title: "Academic Years",
    years: yearsWithCounts,
    breadcrumbs: [ROOT, { label: "Academic Years" }],
  });
};

exports.create = async (req, res) => {
  const { yearStart, yearEnd, label, isCurrent, isActive } = req.body;
  const start = parseInt(yearStart, 10);
  const end = parseInt(yearEnd, 10);

  if (!start || !end || start >= end) {
    req.flash("error", "Please provide a valid starting year and ending year (start must be less than end).");
    return res.redirect("/admin/academic-years");
  }

  const computedLabel = label && label.trim() ? label.trim() : `${start}-${end}`;
  const admissionYear = start;

  const existing = await AcademicYear.findOne({ where: { admissionYear } });
  if (existing) {
    req.flash("error", `An academic year for admission year ${admissionYear} (${computedLabel}) already exists.`);
    return res.redirect("/admin/academic-years");
  }

  if (isCurrent === "true" || isCurrent === true) {
    await AcademicYear.update({ isCurrent: false }, { where: {} });
  }

  const created = await AcademicYear.create({
    yearStart: start,
    yearEnd: end,
    label: computedLabel,
    admissionYear,
    isActive: isActive !== "false" && isActive !== false,
    isCurrent: isCurrent === "true" || isCurrent === true,
  });

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "CREATE_ACADEMIC_YEAR",
    entityType: "AcademicYear",
    entityId: created.id,
    details: { label: computedLabel, admissionYear },
  });

  req.flash("success", `Academic year ${computedLabel} created successfully.`);
  res.redirect("/admin/academic-years");
};

exports.toggleStatus = async (req, res) => {
  const year = await AcademicYear.findByPk(req.params.id);
  if (!year) {
    req.flash("error", "Academic year not found.");
    return res.redirect("/admin/academic-years");
  }

  year.isActive = !year.isActive;
  // If deactivating the current year, unset current
  if (!year.isActive && year.isCurrent) {
    year.isCurrent = false;
  }
  await year.save();

  await AuditLog.create({
    userId: req.currentUser.id,
    action: year.isActive ? "ACTIVATE_ACADEMIC_YEAR" : "DEACTIVATE_ACADEMIC_YEAR",
    entityType: "AcademicYear",
    entityId: year.id,
    details: { label: year.label },
  });

  req.flash("success", `Academic year ${year.label} is now ${year.isActive ? "active" : "inactive"}.`);
  res.redirect("/admin/academic-years");
};

exports.makeCurrent = async (req, res) => {
  const year = await AcademicYear.findByPk(req.params.id);
  if (!year) {
    req.flash("error", "Academic year not found.");
    return res.redirect("/admin/academic-years");
  }

  await AcademicYear.update({ isCurrent: false }, { where: {} });
  year.isCurrent = true;
  year.isActive = true; // Must be active if current
  await year.save();

  await AuditLog.create({
    userId: req.currentUser.id,
    action: "SET_DEFAULT_ACADEMIC_YEAR",
    entityType: "AcademicYear",
    entityId: year.id,
    details: { label: year.label },
  });

  req.flash("success", `${year.label} is now set as the default active academic year.`);
  res.redirect("/admin/academic-years");
};
