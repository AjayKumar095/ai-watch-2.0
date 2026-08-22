const { ProgramOffering, Program, AcademicSession, Section, AuditLog } = require("../models");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const OFFERINGS = { label: "Program Offerings", url: "/admin/offerings" };

exports.list = async (req, res) => {
  const offerings = await ProgramOffering.findAll({
    include: [Program, AcademicSession, Section],
    order: [["semesterNumber", "ASC"]],
  });
  res.render("admin/offerings/index", { title: "Program Offerings", offerings, breadcrumbs: [ROOT, { label: "Program Offerings" }] });
};

exports.showCreate = async (req, res) => {
  const [programs, sessions] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  res.render("admin/offerings/new", { title: "Add Program Offering", programs, sessions, error: null, formData: {}, breadcrumbs: [ROOT, OFFERINGS, { label: "Add Offering" }] });
};

exports.create = async (req, res) => {
  const { programId, semesterNumber, academicSessionId } = req.body;
  const [programs, sessions] = await Promise.all([
    Program.findAll({ where: { isActive: true } }),
    AcademicSession.findAll({ where: { isActive: true } }),
  ]);
  const breadcrumbs = [ROOT, OFFERINGS, { label: "Add Offering" }];
  const rerender = (error) => res.status(400).render("admin/offerings/new", { title: "Add Program Offering", programs, sessions, error, formData: req.body, breadcrumbs });

  if (!programId || !semesterNumber || !academicSessionId) return rerender("All fields are required.");

  const program = await Program.findByPk(programId);
  if (parseInt(semesterNumber, 10) > program.totalSemesters) {
    return rerender(`${program.name} only has ${program.totalSemesters} semesters.`);
  }

  const existing = await ProgramOffering.findOne({ where: { programId, semesterNumber, academicSessionId } });
  if (existing) return rerender("This program/semester/session combination already exists.");

  const offering = await ProgramOffering.create({ programId, semesterNumber: parseInt(semesterNumber, 10), academicSessionId });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_PROGRAM_OFFERING", entityType: "ProgramOffering", entityId: offering.id, metadata: {} });
  res.redirect("/admin/offerings");
};
