const { Section, ProgramOffering, Program, AcademicSession, AuditLog } = require("../models");

exports.list = async (req, res) => {
  const offerings = await ProgramOffering.findAll({
    include: [
      Program,
      AcademicSession,
      { model: Section, where: { parentSectionId: null }, required: false, include: [{ model: Section, as: "subGroups" }] },
    ],
    order: [["semesterNumber", "ASC"]],
  });
  res.render("admin/sections/index", { title: "Sections & Sub-Groups", offerings });
};

exports.showCreate = async (req, res) => {
  const offerings = await ProgramOffering.findAll({ include: [Program, AcademicSession] });
  const topSections = await Section.findAll({ where: { parentSectionId: null }, include: [{ model: ProgramOffering, include: [Program] }] });
  res.render("admin/sections/new", { title: "Add Section / Sub-Group", offerings, topSections, error: null, formData: {} });
};

exports.create = async (req, res) => {
  const { programOfferingId, name, kind, parentSectionId, capacity } = req.body;
  const offerings = await ProgramOffering.findAll({ include: [Program, AcademicSession] });
  const topSections = await Section.findAll({ where: { parentSectionId: null }, include: [{ model: ProgramOffering, include: [Program] }] });
  const rerender = (error) => res.status(400).render("admin/sections/new", { title: "Add Section / Sub-Group", offerings, topSections, error, formData: req.body });

  if (!programOfferingId || !name) return rerender("Program offering and name are required.");
  if (kind === "GROUP" && !parentSectionId) return rerender("A sub-group needs a parent Section selected.");

  const existing = await Section.findOne({ where: { programOfferingId, parentSectionId: kind === "GROUP" ? parentSectionId : null, name } });
  if (existing) return rerender("A section/sub-group with this name already exists at this level.");

  const section = await Section.create({
    programOfferingId,
    name,
    kind: kind === "GROUP" ? "GROUP" : "SECTION",
    parentSectionId: kind === "GROUP" ? parentSectionId : null,
    capacity: capacity ? parseInt(capacity, 10) : null,
  });
  await AuditLog.create({ userId: req.currentUser.id, action: "CREATE_SECTION", entityType: "Section", entityId: section.id, metadata: { name, kind } });
  res.redirect("/admin/sections");
};
