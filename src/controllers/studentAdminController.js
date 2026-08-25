// Admin-facing student directory with filters (school, program, section,
// sub-group, semester, free-text search). Filters combine via a single GET
// form (auto-submitting selects) so the whole filter state lives in the
// URL query string — consistent with the Program Workspace's tab pattern.
const { Op } = require("sequelize");
const {
  StudentProfile,
  User,
  Program,
  School,
  Specialization,
  Section,
  AcademicSession,
} = require("../models");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };

exports.list = async (req, res) => {
  const { schoolId, programId, sectionId, subGroupId, semesterNumber, search } = req.query;

  const where = {};
  if (programId) {
    where.programId = programId;
  } else if (schoolId) {
    const programsInSchool = await Program.findAll({ where: { schoolId }, attributes: ["id"] });
    where.programId = programsInSchool.map((p) => p.id);
  }
  if (subGroupId) where.currentSectionId = subGroupId;
  else if (sectionId) where.currentSectionId = sectionId;
  if (semesterNumber) where.currentSemesterNumber = parseInt(semesterNumber, 10);

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const matchingUsers = await User.findAll({
      where: { [Op.or]: [{ firstName: { [Op.like]: term } }, { lastName: { [Op.like]: term } }, { email: { [Op.like]: term } }] },
      attributes: ["id"],
    });
    const matchingByRoll = await StudentProfile.findAll({ where: { rollNo: { [Op.like]: term } }, attributes: ["id"] });
    const matchingByUser = await StudentProfile.findAll({ where: { userId: matchingUsers.map((u) => u.id) }, attributes: ["id"] });
    const searchIds = [...new Set([...matchingByRoll.map((s) => s.id), ...matchingByUser.map((s) => s.id)])];
    where.id = searchIds; // empty array correctly yields "no results" rather than "no filter"
  }

  const students = await StudentProfile.findAll({
    where,
    include: [User, Program, Specialization, { model: Section, as: "currentSection" }, AcademicSession],
    order: [["rollNo", "ASC"]],
    limit: 300,
  });

  // Filter dropdown options, cascaded server-side from whatever's already selected.
  const schools = await School.findAll({ where: { isActive: true }, order: [["name", "ASC"]] });
  const programWhere = schoolId ? { schoolId } : {};
  const programs = await Program.findAll({ where: programWhere, order: [["name", "ASC"]] });

  let sections = [];
  let subGroups = [];
  const sectionProgramFilter = programId ? { programId } : (schoolId ? { programId: (await Program.findAll({ where: { schoolId }, attributes: ["id"] })).map((p) => p.id) } : null);
  if (sectionProgramFilter) {
    // Sections belong to a ProgramOffering, which belongs to a Program — join through.
    const { ProgramOffering } = require("../models");
    const offerings = await ProgramOffering.findAll({ where: sectionProgramFilter, attributes: ["id"] });
    const offeringIds = offerings.map((o) => o.id);
    sections = await Section.findAll({ where: { programOfferingId: offeringIds, parentSectionId: null }, order: [["name", "ASC"]] });
    if (sectionId) {
      subGroups = await Section.findAll({ where: { parentSectionId: sectionId }, order: [["name", "ASC"]] });
    }
  }

  res.render("admin/students/index", {
    title: "Students",
    students,
    schools,
    programs,
    sections,
    subGroups,
    filters: { schoolId, programId, sectionId, subGroupId, semesterNumber, search },
    breadcrumbs: [ROOT, { label: "Students" }],
  });
};
