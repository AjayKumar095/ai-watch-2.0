const { TeacherProfile, User, School, TeacherSubjectMapping, ApprovalRequest, AuditLog } = require("../models");
const { safeDestroy } = require("../utils/deleteHelpers");

const ROOT = { label: "Dashboard", url: "/admin/dashboard" };
const TEACHERS = { label: "Teachers", url: "/admin/teachers" };

exports.list = async (req, res) => {
  const teachers = await TeacherProfile.findAll({ include: [User, School], order: [["employeeCode", "ASC"]] });
  console.log(teachers);

  res.render("admin/teachers/index", { title: "Teachers", teachers, breadcrumbs: [ROOT, { label: "Teachers" }] });

};

exports.showEdit = async (req, res) => {
  const teacher = await TeacherProfile.findByPk(req.params.id, { include: [User, School] });
  if (!teacher) return res.redirect("/admin/teachers");
  const schools = await School.findAll({ where: { isActive: true } });
  res.render("admin/teachers/edit", {
    title: "Edit Teacher", teacher, schools, error: null,
    breadcrumbs: [ROOT, TEACHERS, { label: `${teacher.User.firstName} ${teacher.User.lastName}` }],
  });
};

exports.edit = async (req, res) => {
  const teacher = await TeacherProfile.findByPk(req.params.id, { include: [User] });
  if (!teacher) return res.redirect("/admin/teachers");
  const { firstName, lastName, employeeCode, schoolId, designation, isActive } = req.body;
  const schools = await School.findAll({ where: { isActive: true } });
  const breadcrumbs = [ROOT, TEACHERS, { label: `${teacher.User.firstName} ${teacher.User.lastName}` }];

  if (!firstName || !lastName || !employeeCode || !schoolId) {
    return res.status(400).render("admin/teachers/edit", { title: "Edit Teacher", teacher, schools, error: "Name, employee code, and school are required.", breadcrumbs });
  }
  const existingCode = await TeacherProfile.findOne({ where: { employeeCode } });
  if (existingCode && existingCode.id !== teacher.id) {
    return res.status(400).render("admin/teachers/edit", { title: "Edit Teacher", teacher, schools, error: "Another teacher already uses this employee code.", breadcrumbs });
  }

  teacher.employeeCode = employeeCode;
  teacher.schoolId = schoolId;
  teacher.designation = designation || null;
  await teacher.save();

  teacher.User.firstName = firstName;
  teacher.User.lastName = lastName;
  teacher.User.isActive = isActive === "on";
  await teacher.User.save();

  await AuditLog.create({ userId: req.currentUser.id, action: "UPDATE_TEACHER", entityType: "TeacherProfile", entityId: teacher.id, metadata: {} });
  res.redirect("/admin/teachers");
};

exports.delete = async (req, res) => {
  const teacher = await TeacherProfile.findByPk(req.params.id);
  if (!teacher) return res.redirect("/admin/teachers");

  // Guard against deleting a teacher who still has subject mappings or
  // pending/decided approval requests tied to them — these should be
  // reassigned first (see architecture report §7.6 on the superadmin
  // reassignment path), not silently orphaned by a hard delete.
  const mappingCount = await TeacherSubjectMapping.count({ where: { teacherId: teacher.id } });
  const approvalCount = await ApprovalRequest.count({ where: { requestedTeacherId: teacher.id } });
  if (mappingCount > 0 || approvalCount > 0) {
    return res.status(409).render("error", {
      title: "Can't delete",
      message: `This teacher still has ${mappingCount} subject mapping(s) and ${approvalCount} approval request(s). Remove/reassign those first, or deactivate the account instead of deleting it.`,
    });
  }

  const userId = teacher.userId;
  await teacher.destroy();
  await User.destroy({ where: { id: userId } });
  await AuditLog.create({ userId: req.currentUser.id, action: "DELETE_TEACHER", entityType: "TeacherProfile", entityId: req.params.id, metadata: {} });
  res.redirect("/admin/teachers");
};
