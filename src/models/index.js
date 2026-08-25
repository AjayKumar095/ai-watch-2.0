const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Load every model definition
const User = require("./User")(sequelize, DataTypes);
const RefreshToken = require("./RefreshToken")(sequelize, DataTypes);
const School = require("./School")(sequelize, DataTypes);
const Program = require("./Program")(sequelize, DataTypes);
const Specialization = require("./Specialization")(sequelize, DataTypes);
const AcademicSession = require("./AcademicSession")(sequelize, DataTypes);
const ProgramOffering = require("./ProgramOffering")(sequelize, DataTypes);
const Section = require("./Section")(sequelize, DataTypes);
const SubjectPool = require("./SubjectPool")(sequelize, DataTypes);
const SubjectOffering = require("./SubjectOffering")(sequelize, DataTypes);
const TeacherProfile = require("./TeacherProfile")(sequelize, DataTypes);
const StudentProfile = require("./StudentProfile")(sequelize, DataTypes);
const TeacherSubjectMapping = require("./TeacherSubjectMapping")(sequelize, DataTypes);
const SubjectEnrollment = require("./SubjectEnrollment")(sequelize, DataTypes);
const ApprovalRequest = require("./ApprovalRequest")(sequelize, DataTypes);
const Assessment = require("./Assessment")(sequelize, DataTypes);
const AssessmentSection = require("./AssessmentSection")(sequelize, DataTypes);
const AssessmentStudentOverride = require("./AssessmentStudentOverride")(sequelize, DataTypes);
const AssessmentLock = require("./AssessmentLock")(sequelize, DataTypes);
const Submission = require("./Submission")(sequelize, DataTypes);
const SemesterCertificate = require("./SemesterCertificate")(sequelize, DataTypes);
const PromotionBatch = require("./PromotionBatch")(sequelize, DataTypes);
const PromotionRecord = require("./PromotionRecord")(sequelize, DataTypes);
const AuditLog = require("./AuditLog")(sequelize, DataTypes);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------

// User <-> profiles (1:1)
User.hasOne(TeacherProfile, { foreignKey: "userId", onDelete: "CASCADE" });
TeacherProfile.belongsTo(User, { foreignKey: "userId" });

User.hasOne(StudentProfile, { foreignKey: "userId", onDelete: "CASCADE" });
StudentProfile.belongsTo(User, { foreignKey: "userId" });

User.hasMany(RefreshToken, { foreignKey: "userId", onDelete: "CASCADE" });
RefreshToken.belongsTo(User, { foreignKey: "userId" });

// Org structure
School.hasMany(Program, { foreignKey: "schoolId", onDelete: "RESTRICT" });
Program.belongsTo(School, { foreignKey: "schoolId" });

School.hasMany(TeacherProfile, { foreignKey: "schoolId", onDelete: "RESTRICT" });
TeacherProfile.belongsTo(School, { foreignKey: "schoolId" });

Program.hasMany(Specialization, { foreignKey: "programId", onDelete: "CASCADE" });
Specialization.belongsTo(Program, { foreignKey: "programId" });

Program.hasMany(ProgramOffering, { foreignKey: "programId", onDelete: "CASCADE" });
ProgramOffering.belongsTo(Program, { foreignKey: "programId" });

AcademicSession.hasMany(ProgramOffering, { foreignKey: "academicSessionId", onDelete: "RESTRICT" });
ProgramOffering.belongsTo(AcademicSession, { foreignKey: "academicSessionId" });

ProgramOffering.hasMany(Section, { foreignKey: "programOfferingId", onDelete: "CASCADE" });
Section.belongsTo(ProgramOffering, { foreignKey: "programOfferingId" });

// Section self-reference for sub-groups (e.g. "A - PG1" under "A")
Section.hasMany(Section, { as: "subGroups", foreignKey: "parentSectionId", onDelete: "CASCADE" });
Section.belongsTo(Section, { as: "parentSection", foreignKey: "parentSectionId" });

// Subjects
// SubjectPool <-> SubjectOffering: RESTRICT, not CASCADE — a subject that's
// actively offered somewhere must have those offerings removed first. This
// is what makes the admin "delete subject" guard actually block instead of
// silently cascading away every offering, assessment, and submission tied
// to it (a data-loss bug caught in testing before this was fixed).
SubjectPool.hasMany(SubjectOffering, { foreignKey: "subjectId", onDelete: "RESTRICT" });
SubjectOffering.belongsTo(SubjectPool, { foreignKey: "subjectId" });

// RESTRICT for the same reason as SubjectPool above — deleting a program
// that still has subject offerings configured (assessments, enrollments,
// mappings) must be blocked, not silently cascaded away.
Program.hasMany(SubjectOffering, { foreignKey: "programId", onDelete: "RESTRICT" });
SubjectOffering.belongsTo(Program, { foreignKey: "programId" });

Specialization.hasMany(SubjectOffering, { foreignKey: "specializationId", onDelete: "SET NULL" });
SubjectOffering.belongsTo(Specialization, { foreignKey: "specializationId" });

AcademicSession.hasMany(SubjectOffering, { foreignKey: "academicSessionId", onDelete: "RESTRICT" });
SubjectOffering.belongsTo(AcademicSession, { foreignKey: "academicSessionId" });

TeacherProfile.hasMany(TeacherSubjectMapping, { foreignKey: "teacherId", onDelete: "CASCADE" });
TeacherSubjectMapping.belongsTo(TeacherProfile, { foreignKey: "teacherId" });

SubjectOffering.hasMany(TeacherSubjectMapping, { foreignKey: "subjectOfferingId", onDelete: "CASCADE" });
TeacherSubjectMapping.belongsTo(SubjectOffering, { foreignKey: "subjectOfferingId" });

Section.hasMany(TeacherSubjectMapping, { foreignKey: "sectionId", onDelete: "CASCADE" });
TeacherSubjectMapping.belongsTo(Section, { foreignKey: "sectionId" }); // nullable = all sections

// RESTRICT: deleting a subject offering that already has enrolled students
// must be blocked, not silently un-enrolled.
SubjectOffering.hasMany(SubjectEnrollment, { foreignKey: "subjectOfferingId", onDelete: "RESTRICT" });
SubjectEnrollment.belongsTo(SubjectOffering, { foreignKey: "subjectOfferingId" });

StudentProfile.hasMany(SubjectEnrollment, { foreignKey: "studentId", onDelete: "CASCADE" });
SubjectEnrollment.belongsTo(StudentProfile, { foreignKey: "studentId" });

Section.hasMany(SubjectEnrollment, { foreignKey: "sectionId", onDelete: "RESTRICT" });
SubjectEnrollment.belongsTo(Section, { foreignKey: "sectionId" });

// People
Program.hasMany(StudentProfile, { foreignKey: "programId", onDelete: "RESTRICT" });
StudentProfile.belongsTo(Program, { foreignKey: "programId" });

Specialization.hasMany(StudentProfile, { foreignKey: "specializationId", onDelete: "SET NULL" });
StudentProfile.belongsTo(Specialization, { foreignKey: "specializationId" });

Section.hasMany(StudentProfile, { as: "studentsCurrentSection", foreignKey: "currentSectionId", onDelete: "SET NULL" });
StudentProfile.belongsTo(Section, { as: "currentSection", foreignKey: "currentSectionId" });

AcademicSession.hasMany(StudentProfile, { foreignKey: "academicSessionId", onDelete: "RESTRICT" });
StudentProfile.belongsTo(AcademicSession, { foreignKey: "academicSessionId" });

// Approval requests (replaces class in-charge)
StudentProfile.hasOne(ApprovalRequest, { foreignKey: "studentId", onDelete: "CASCADE" });
ApprovalRequest.belongsTo(StudentProfile, { foreignKey: "studentId" });

TeacherProfile.hasMany(ApprovalRequest, { as: "approvalRequests", foreignKey: "requestedTeacherId", onDelete: "RESTRICT" });
ApprovalRequest.belongsTo(TeacherProfile, { as: "requestedTeacher", foreignKey: "requestedTeacherId" });

User.hasMany(ApprovalRequest, { as: "decidedApprovals", foreignKey: "decidedByUserId", onDelete: "SET NULL" });
ApprovalRequest.belongsTo(User, { as: "decidedBy", foreignKey: "decidedByUserId" });

// Assessments & submissions
// RESTRICT: deleting a subject offering that already has assessments
// (with real student submissions) must be blocked, not cascaded away.
SubjectOffering.hasMany(Assessment, { foreignKey: "subjectOfferingId", onDelete: "RESTRICT" });
Assessment.belongsTo(SubjectOffering, { foreignKey: "subjectOfferingId" });

User.hasMany(Assessment, { as: "createdAssessments", foreignKey: "createdById", onDelete: "RESTRICT" });
Assessment.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });

Assessment.hasMany(AssessmentSection, { foreignKey: "assessmentId", onDelete: "CASCADE" });
AssessmentSection.belongsTo(Assessment, { foreignKey: "assessmentId" });
Section.hasMany(AssessmentSection, { foreignKey: "sectionId", onDelete: "CASCADE" });
AssessmentSection.belongsTo(Section, { foreignKey: "sectionId" });

Assessment.hasMany(AssessmentStudentOverride, { foreignKey: "assessmentId", onDelete: "CASCADE" });
AssessmentStudentOverride.belongsTo(Assessment, { foreignKey: "assessmentId" });
StudentProfile.hasMany(AssessmentStudentOverride, { foreignKey: "studentId", onDelete: "CASCADE" });
AssessmentStudentOverride.belongsTo(StudentProfile, { foreignKey: "studentId" });

SubjectOffering.hasMany(AssessmentLock, { foreignKey: "subjectOfferingId", onDelete: "CASCADE" });
AssessmentLock.belongsTo(SubjectOffering, { foreignKey: "subjectOfferingId" });
Section.hasMany(AssessmentLock, { foreignKey: "sectionId", onDelete: "CASCADE" });
AssessmentLock.belongsTo(Section, { foreignKey: "sectionId" });
User.hasMany(AssessmentLock, { as: "lockedAssessmentLocks", foreignKey: "lockedById", onDelete: "SET NULL" });
AssessmentLock.belongsTo(User, { as: "lockedBy", foreignKey: "lockedById" });

Assessment.hasMany(Submission, { foreignKey: "assessmentId", onDelete: "CASCADE" });
Submission.belongsTo(Assessment, { foreignKey: "assessmentId" });
StudentProfile.hasMany(Submission, { foreignKey: "studentId", onDelete: "CASCADE" });
Submission.belongsTo(StudentProfile, { foreignKey: "studentId" });
Section.hasMany(Submission, { foreignKey: "sectionId", onDelete: "RESTRICT" });
Submission.belongsTo(Section, { foreignKey: "sectionId" });
User.hasMany(Submission, { as: "evaluatedSubmissions", foreignKey: "evaluatedById", onDelete: "SET NULL" });
Submission.belongsTo(User, { as: "evaluatedBy", foreignKey: "evaluatedById" });

// Certificates
StudentProfile.hasMany(SemesterCertificate, { foreignKey: "studentId", onDelete: "CASCADE" });
SemesterCertificate.belongsTo(StudentProfile, { foreignKey: "studentId" });
Program.hasMany(SemesterCertificate, { foreignKey: "programId", onDelete: "CASCADE" });
SemesterCertificate.belongsTo(Program, { foreignKey: "programId" });
AcademicSession.hasMany(SemesterCertificate, { foreignKey: "academicSessionId", onDelete: "RESTRICT" });
SemesterCertificate.belongsTo(AcademicSession, { foreignKey: "academicSessionId" });

// Promotion
Program.hasMany(PromotionBatch, { foreignKey: "programId", onDelete: "CASCADE" });
PromotionBatch.belongsTo(Program, { foreignKey: "programId" });
AcademicSession.hasMany(PromotionBatch, { as: "promotionsFrom", foreignKey: "fromSessionId", onDelete: "RESTRICT" });
PromotionBatch.belongsTo(AcademicSession, { as: "fromSession", foreignKey: "fromSessionId" });
AcademicSession.hasMany(PromotionBatch, { as: "promotionsTo", foreignKey: "toSessionId", onDelete: "RESTRICT" });
PromotionBatch.belongsTo(AcademicSession, { as: "toSession", foreignKey: "toSessionId" });
User.hasMany(PromotionBatch, { as: "executedPromotions", foreignKey: "executedById", onDelete: "RESTRICT" });
PromotionBatch.belongsTo(User, { as: "executedBy", foreignKey: "executedById" });

PromotionBatch.hasMany(PromotionRecord, { foreignKey: "promotionBatchId", onDelete: "CASCADE" });
PromotionRecord.belongsTo(PromotionBatch, { foreignKey: "promotionBatchId" });
StudentProfile.hasMany(PromotionRecord, { foreignKey: "studentId", onDelete: "CASCADE" });
PromotionRecord.belongsTo(StudentProfile, { foreignKey: "studentId" });

// Audit
User.hasMany(AuditLog, { foreignKey: "userId", onDelete: "CASCADE" });
AuditLog.belongsTo(User, { foreignKey: "userId" });

module.exports = {
  sequelize,
  User,
  RefreshToken,
  School,
  Program,
  Specialization,
  AcademicSession,
  ProgramOffering,
  Section,
  SubjectPool,
  SubjectOffering,
  TeacherProfile,
  StudentProfile,
  TeacherSubjectMapping,
  SubjectEnrollment,
  ApprovalRequest,
  Assessment,
  AssessmentSection,
  AssessmentStudentOverride,
  AssessmentLock,
  Submission,
  SemesterCertificate,
  PromotionBatch,
  PromotionRecord,
  AuditLog,
};
