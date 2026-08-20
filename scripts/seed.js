// Seeds: the ONE superadmin account, plus a small set of sample academic
// data so the login/onboarding/dashboard flows can be exercised end to end.
//
// Run with: npm run seed
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const validateEnv = require("../src/config/validateEnv");
validateEnv();
const {
  sequelize,
  User,
  School,
  Program,
  Specialization,
  AcademicSession,
  ProgramOffering,
  Section,
  SubjectPool,
  SubjectOffering,
  TeacherProfile,
  TeacherSubjectMapping,
  StudentProfile,
  SubjectEnrollment,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");

async function main() {
  await sequelize.sync(); // use { force: true } only in a throwaway dev DB

  // --- Superadmin (structurally: only ever create this once) ---
  const existingSuperadmin = await User.findOne({ where: { role: "SUPERADMIN" } });
  if (existingSuperadmin) {
    console.log("Superadmin already exists:", existingSuperadmin.email);
  } else {
    const passwordHash = await hashPassword("ChangeMe123!");
    const superadmin = await User.create({
      email: "admin@aiwatch.local",
      firstName: "System",
      lastName: "Admin",
      passwordHash,
      role: "SUPERADMIN",
      isActive: true,
    });
    console.log("Created superadmin:", superadmin.email, "/ password: ChangeMe123!");
  }

  // --- Sample academic structure ---
  const [school] = await School.findOrCreate({
    where: { code: "SOB" },
    defaults: { name: "School of Business", isActive: true },
  });

  const [program] = await Program.findOrCreate({
    where: { code: "BBA" },
    defaults: { name: "BBA", schoolId: school.id, totalSemesters: 6, isActive: true },
  });

  const [specFinance] = await Specialization.findOrCreate({
    where: { programId: program.id, name: "Finance" },
    defaults: { isActive: true },
  });

  const [session] = await AcademicSession.findOrCreate({
    where: { label: "2026-2027" },
    defaults: { startDate: "2026-07-01", endDate: "2027-06-30", isActive: true },
  });

  const [offering] = await ProgramOffering.findOrCreate({
    where: { programId: program.id, semesterNumber: 3, academicSessionId: session.id },
    defaults: {},
  });

  const [sectionA] = await Section.findOrCreate({
    where: { programOfferingId: offering.id, name: "A", parentSectionId: null },
    defaults: { kind: "SECTION", capacity: 60 },
  });

  const [subject] = await SubjectPool.findOrCreate({
    where: { code: "GEN-AI-101" },
    defaults: { name: "AI for All", category: "UNIVERSITY_WIDE", isActive: true },
  });

  const [subjectOffering] = await SubjectOffering.findOrCreate({
    where: {
      subjectId: subject.id,
      programId: program.id,
      semesterNumber: 3,
      specializationId: null,
      academicSessionId: session.id,
    },
    defaults: {},
  });

  // --- Sample teacher ---
  let teacherUser = await User.findOne({ where: { email: "teacher@aiwatch.local" } });
  let teacherProfile;
  if (!teacherUser) {
    const passwordHash = await hashPassword("ChangeMe123!");
    teacherUser = await User.create({
      email: "teacher@aiwatch.local",
      firstName: "Meera",
      lastName: "Sharma",
      passwordHash,
      role: "TEACHER",
      isActive: true,
    });
    teacherProfile = await TeacherProfile.create({
      userId: teacherUser.id,
      employeeCode: "EMP-1042",
      schoolId: school.id,
      designation: "Assistant Professor",
    });
    console.log("Created sample teacher:", teacherUser.email, "/ password: ChangeMe123!");
  } else {
    teacherProfile = await TeacherProfile.findOne({ where: { userId: teacherUser.id } });
  }

  await TeacherSubjectMapping.findOrCreate({
    where: { teacherId: teacherProfile.id, subjectOfferingId: subjectOffering.id, sectionId: sectionA.id },
    defaults: {},
  });

  console.log("\nSeed complete. Log in at /login, or start a student sign-up at /signup/student.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
