// Seeds: the ONE superadmin account, plus a broad set of sample academic
// data — multiple schools/programs/specializations, sections with
// sub-groups, a university-wide subject offered across programs,
// 3 teachers each mapped to a different subject+program, 10 students
// (stu1..stu10@student.local) spread across programs/sections/specializations
// (including a deliberately mixed-specialization section), enrollments,
// and a couple of assessments in different submission/evaluation states —
// enough to exercise every dashboard, roster, and evaluation view.
//
// Idempotent-safe (findOrCreate throughout), but for the clearest picture
// run this against a FRESH database:
//   rm -f dev.sqlite3 && npm run seed
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
  ApprovalRequest,
  Assessment,
  AssessmentSection,
  Submission,
} = require("../src/models");
const { hashPassword } = require("../src/utils/password");

const DEFAULT_PASSWORD = "ChangeMe123!";

async function main() {
  // Schema is now owned by sequelize-cli migrations (see migrations/), NOT
  // by sync(). `sync({ alter: true })` used to run here, but on SQLite
  // "alter" works by rebuilding the whole table and copying rows back in —
  // which is exactly what could silently drop/mangle data you'd already
  // edited after the first seed. Migrations change the schema in place
  // instead, so re-seeding never touches structure and never risks data.
  //
  // This just confirms the DB is reachable and reminds you if you forgot
  // to run migrations first.
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  try {
    await qi.describeTable("users");
  } catch (err) {
    console.error("\n❌ The `users` table doesn't exist yet.");
    console.error("   Run migrations before seeding:");
    console.error("     npm run migrate       # fresh DB");
    console.error("     npm run db:baseline   # existing pre-migrations DB, once — then npm run migrate\n");
    process.exit(1);
  }

  // --- Superadmin (structurally: only ever create this once) ---
  const existingSuperadmin = await User.findOne({ where: { role: "SUPERADMIN" } });
  if (existingSuperadmin) {
    console.log("Superadmin already exists:", existingSuperadmin.email);
  } else {
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const superadmin = await User.create({
      email: "admin@aiwatch.local",
      firstName: "System",
      lastName: "Admin",
      passwordHash,
      role: "SUPERADMIN",
      isActive: true,
    });
    console.log(`Created superadmin: ${superadmin.email} / password: ${DEFAULT_PASSWORD}`);
  }

  // ---------------------------------------------------------------------
  // Schools
  // ---------------------------------------------------------------------
  const [schoolBusiness] = await School.findOrCreate({
    where: { code: "SOB" },
    defaults: { name: "School of Business", isActive: true },
  });
  const [schoolLaw] = await School.findOrCreate({
    where: { code: "SOL" },
    defaults: { name: "School of Law", isActive: true },
  });
  const [schoolCS] = await School.findOrCreate({
    where: { code: "SOCS" },
    defaults: { name: "School of Computer Science", isActive: true },
  });

  // ---------------------------------------------------------------------
  // Programs + Specializations
  // ---------------------------------------------------------------------
  const [bba] = await Program.findOrCreate({
    where: { code: "BBA" },
    defaults: { name: "BBA", schoolId: schoolBusiness.id, totalSemesters: 6, isActive: true },
  });
  const [specFinance] = await Specialization.findOrCreate({
    where: { programId: bba.id, name: "Finance" },
    defaults: { isActive: true },
  });
  const [specMarketing] = await Specialization.findOrCreate({
    where: { programId: bba.id, name: "Marketing" },
    defaults: { isActive: true },
  });

  const [llb] = await Program.findOrCreate({
    where: { code: "LLB" },
    defaults: { name: "LLB", schoolId: schoolLaw.id, totalSemesters: 5, isActive: true },
  });
  const [specCorpLaw] = await Specialization.findOrCreate({
    where: { programId: llb.id, name: "Corporate Law" },
    defaults: { isActive: true },
  });
  const [specCrimLaw] = await Specialization.findOrCreate({
    where: { programId: llb.id, name: "Criminal Law" },
    defaults: { isActive: true },
  });

  const [bca] = await Program.findOrCreate({
    where: { code: "BCA" },
    defaults: { name: "BCA", schoolId: schoolCS.id, totalSemesters: 6, isActive: true },
  });
  const [specDataScience] = await Specialization.findOrCreate({
    where: { programId: bca.id, name: "Data Science" },
    defaults: { isActive: true },
  });

  // ---------------------------------------------------------------------
  // Academic Session
  // ---------------------------------------------------------------------
  const [session] = await AcademicSession.findOrCreate({
    where: { label: "2026-2027" },
    defaults: { startDate: "2026-07-01", endDate: "2027-06-30", isActive: true },
  });

  // ---------------------------------------------------------------------
  // Program Offerings
  // ---------------------------------------------------------------------
  const [bbaOffering] = await ProgramOffering.findOrCreate({
    where: { programId: bba.id, semesterNumber: 3, academicSessionId: session.id },
    defaults: {},
  });
  const [llbOffering] = await ProgramOffering.findOrCreate({
    where: { programId: llb.id, semesterNumber: 1, academicSessionId: session.id },
    defaults: {},
  });
  const [bcaOffering] = await ProgramOffering.findOrCreate({
    where: { programId: bca.id, semesterNumber: 1, academicSessionId: session.id },
    defaults: {},
  });

  // ---------------------------------------------------------------------
  // Sections & Sub-Groups
  // ---------------------------------------------------------------------
  // BBA: Section A (with two practical sub-groups) + Section B
  const [bbaSectionA] = await Section.findOrCreate({
    where: { programOfferingId: bbaOffering.id, parentSectionId: null, name: "A" },
    defaults: { kind: "SECTION", capacity: 60 },
  });
  const [bbaSectionAPG1] = await Section.findOrCreate({
    where: { programOfferingId: bbaOffering.id, parentSectionId: bbaSectionA.id, name: "PG1" },
    defaults: { kind: "GROUP", capacity: 30 },
  });
  const [bbaSectionAPG2] = await Section.findOrCreate({
    where: { programOfferingId: bbaOffering.id, parentSectionId: bbaSectionA.id, name: "PG2" },
    defaults: { kind: "GROUP", capacity: 30 },
  });
  const [bbaSectionB] = await Section.findOrCreate({
    where: { programOfferingId: bbaOffering.id, parentSectionId: null, name: "B" },
    defaults: { kind: "SECTION", capacity: 50 },
  });

  // LLB: single Section A
  const [llbSectionA] = await Section.findOrCreate({
    where: { programOfferingId: llbOffering.id, parentSectionId: null, name: "A" },
    defaults: { kind: "SECTION", capacity: 40 },
  });

  // BCA: Section A + Section B
  const [bcaSectionA] = await Section.findOrCreate({
    where: { programOfferingId: bcaOffering.id, parentSectionId: null, name: "A" },
    defaults: { kind: "SECTION", capacity: 50 },
  });
  const [bcaSectionB] = await Section.findOrCreate({
    where: { programOfferingId: bcaOffering.id, parentSectionId: null, name: "B" },
    defaults: { kind: "SECTION", capacity: 50 },
  });

  // ---------------------------------------------------------------------
  // Subject Pool
  // ---------------------------------------------------------------------
  const [subjectAI] = await SubjectPool.findOrCreate({
    where: { code: "GEN-AI-101" },
    defaults: { name: "AI for All", category: "UNIVERSITY_WIDE", isActive: true },
  });
  await SubjectPool.findOrCreate({
    where: { code: "GEN-ETH-101" },
    defaults: { name: "Data Ethics", category: "UNIVERSITY_WIDE", isActive: true },
  });
  const [subjectFinance] = await SubjectPool.findOrCreate({
    where: { code: "FIN-301" },
    defaults: { name: "Corporate Finance", category: "PROGRAM_SPECIFIC", isActive: true },
  });
  const [subjectLegalWriting] = await SubjectPool.findOrCreate({
    where: { code: "LAW-101" },
    defaults: { name: "Legal Writing", category: "PROGRAM_SPECIFIC", isActive: true },
  });
  const [subjectDataStructures] = await SubjectPool.findOrCreate({
    where: { code: "CS-201" },
    defaults: { name: "Data Structures", category: "PROGRAM_SPECIFIC", isActive: true },
  });

  // ---------------------------------------------------------------------
  // Subject Offerings
  // ---------------------------------------------------------------------
  // "AI for All" offered across all three programs — the university-wide subject.
  const [aiOfferingBBA] = await SubjectOffering.findOrCreate({
    where: { subjectId: subjectAI.id, programId: bba.id, semesterNumber: 3, specializationId: null, academicSessionId: session.id },
    defaults: {},
  });
  const [aiOfferingLLB] = await SubjectOffering.findOrCreate({
    where: { subjectId: subjectAI.id, programId: llb.id, semesterNumber: 1, specializationId: null, academicSessionId: session.id },
    defaults: {},
  });
  const [aiOfferingBCA] = await SubjectOffering.findOrCreate({
    where: { subjectId: subjectAI.id, programId: bca.id, semesterNumber: 1, specializationId: null, academicSessionId: session.id },
    defaults: {},
  });

  const [financeOffering] = await SubjectOffering.findOrCreate({
    where: { subjectId: subjectFinance.id, programId: bba.id, semesterNumber: 3, specializationId: specFinance.id, academicSessionId: session.id },
    defaults: {},
  });
  const [legalWritingOffering] = await SubjectOffering.findOrCreate({
    where: { subjectId: subjectLegalWriting.id, programId: llb.id, semesterNumber: 1, specializationId: null, academicSessionId: session.id },
    defaults: {},
  });
  const [dataStructuresOffering] = await SubjectOffering.findOrCreate({
    where: { subjectId: subjectDataStructures.id, programId: bca.id, semesterNumber: 1, specializationId: null, academicSessionId: session.id },
    defaults: {},
  });

  // ---------------------------------------------------------------------
  // 3 Teachers — each mapped to a different subject + program
  // ---------------------------------------------------------------------
  async function ensureTeacher({ email, firstName, lastName, employeeCode, schoolId, designation }) {
    let user = await User.findOne({ where: { email } });
    if (!user) {
      const passwordHash = await hashPassword(DEFAULT_PASSWORD);
      user = await User.create({ email, firstName, lastName, passwordHash, role: "TEACHER", isActive: true });
      console.log(`Created teacher: ${email} / password: ${DEFAULT_PASSWORD}`);
    }
    const [profile] = await TeacherProfile.findOrCreate({
      where: { userId: user.id },
      defaults: { employeeCode, schoolId, designation },
    });
    return { user, profile };
  }

  const meera = await ensureTeacher({
    email: "teacher@aiwatch.local",
    firstName: "Meera",
    lastName: "Sharma",
    employeeCode: "EMP-1042",
    schoolId: schoolBusiness.id,
    designation: "Assistant Professor",
  });
  const arjun = await ensureTeacher({
    email: "arjun@aiwatch.local",
    firstName: "Arjun",
    lastName: "Verma",
    employeeCode: "EMP-1043",
    schoolId: schoolLaw.id,
    designation: "Lecturer",
  });
  const priya = await ensureTeacher({
    email: "priya@aiwatch.local",
    firstName: "Priya",
    lastName: "Nair",
    employeeCode: "EMP-1044",
    schoolId: schoolCS.id,
    designation: "Assistant Professor",
  });

  // Each teacher's mapping is scoped to ALL sections of their offering (sectionId: null),
  // so it automatically covers the BBA sub-groups (PG1/PG2) and Section B too.
  await TeacherSubjectMapping.findOrCreate({
    where: { teacherId: meera.profile.id, subjectOfferingId: aiOfferingBBA.id, sectionId: null },
    defaults: {},
  });
  await TeacherSubjectMapping.findOrCreate({
    where: { teacherId: arjun.profile.id, subjectOfferingId: legalWritingOffering.id, sectionId: null },
    defaults: {},
  });
  await TeacherSubjectMapping.findOrCreate({
    where: { teacherId: priya.profile.id, subjectOfferingId: dataStructuresOffering.id, sectionId: null },
    defaults: {},
  });

  // ---------------------------------------------------------------------
  // 10 Students (stu1..stu10@student.local) — spread across programs,
  // sections/sub-groups, and specializations. stu1-stu3 deliberately share
  // BBA Section A's sub-groups across DIFFERENT specializations (Finance /
  // Marketing) to demonstrate the mixed-specialization-in-one-classroom case.
  // stu10 is left with a PENDING approval request to demo that dashboard panel.
  // ---------------------------------------------------------------------
  const studentPlan = [
    { n: 1, program: bba, offering: bbaOffering, section: bbaSectionAPG1, specialization: specFinance, requestedTeacher: meera, approve: true },
    { n: 2, program: bba, offering: bbaOffering, section: bbaSectionAPG1, specialization: specMarketing, requestedTeacher: meera, approve: true },
    { n: 3, program: bba, offering: bbaOffering, section: bbaSectionAPG2, specialization: specFinance, requestedTeacher: meera, approve: true },
    { n: 4, program: bba, offering: bbaOffering, section: bbaSectionB, specialization: specMarketing, requestedTeacher: meera, approve: true },
    { n: 5, program: llb, offering: llbOffering, section: llbSectionA, specialization: specCorpLaw, requestedTeacher: arjun, approve: true },
    { n: 6, program: llb, offering: llbOffering, section: llbSectionA, specialization: specCrimLaw, requestedTeacher: arjun, approve: true },
    { n: 7, program: bca, offering: bcaOffering, section: bcaSectionA, specialization: specDataScience, requestedTeacher: priya, approve: true },
    { n: 8, program: bca, offering: bcaOffering, section: bcaSectionA, specialization: null, requestedTeacher: priya, approve: true },
    { n: 9, program: bca, offering: bcaOffering, section: bcaSectionB, specialization: specDataScience, requestedTeacher: priya, approve: true },
    { n: 10, program: bca, offering: bcaOffering, section: bcaSectionB, specialization: null, requestedTeacher: priya, approve: false },
  ];

  const createdStudents = {};

  for (const plan of studentPlan) {
    const email = `stu${plan.n}@student.local`;
    const rollNo = `STU-${String(plan.n).padStart(3, "0")}`;

    let user = await User.findOne({ where: { email } });
    if (!user) {
      const passwordHash = await hashPassword(DEFAULT_PASSWORD);
      user = await User.create({
        email,
        firstName: `Student${plan.n}`,
        lastName: "Test",
        passwordHash,
        role: "STUDENT",
        isActive: false,
      });
    }

    const [studentProfile] = await StudentProfile.findOrCreate({
      where: { userId: user.id },
      defaults: {
        rollNo,
        programId: plan.program.id,
        specializationId: plan.specialization ? plan.specialization.id : null,
        currentSemesterNumber: plan.offering.semesterNumber,
        currentSectionId: plan.section.id,
        academicSessionId: session.id,
        status: "ACTIVE",
        isVerified: false,
      },
    });

    await ApprovalRequest.findOrCreate({
      where: { studentId: studentProfile.id },
      defaults: { requestedTeacherId: plan.requestedTeacher.profile.id, status: "PENDING" },
    });

    if (plan.approve) {
      await ApprovalRequest.update(
        { status: "APPROVED", decidedByUserId: plan.requestedTeacher.user.id, decidedAt: new Date() },
        { where: { studentId: studentProfile.id } }
      );
      studentProfile.isVerified = true;
      await studentProfile.save();
      user.isActive = true;
      await user.save();
    }

    createdStudents[plan.n] = { user, studentProfile, plan };
  }

  console.log(`Created/verified 10 students: stu1..stu10@student.local / password: ${DEFAULT_PASSWORD} (stu10 left pending approval)`);

  // ---------------------------------------------------------------------
  // Subject Enrollments — auto-enroll each approved student into the
  // subject offerings that match their program/semester/specialization.
  // ---------------------------------------------------------------------
  async function enroll(studentProfile, subjectOffering) {
    if (!studentProfile.isVerified) return; // stu10 stays unenrolled until approved
    await SubjectEnrollment.findOrCreate({
      where: { subjectOfferingId: subjectOffering.id, studentId: studentProfile.id },
      defaults: { sectionId: studentProfile.currentSectionId },
    });
  }

  for (const n of [1, 2, 3, 4]) {
    const { studentProfile, plan } = createdStudents[n];
    await enroll(studentProfile, aiOfferingBBA);
    if (plan.specialization && plan.specialization.id === specFinance.id) {
      await enroll(studentProfile, financeOffering);
    }
  }
  for (const n of [5, 6]) {
    const { studentProfile } = createdStudents[n];
    await enroll(studentProfile, aiOfferingLLB);
    await enroll(studentProfile, legalWritingOffering);
  }
  for (const n of [7, 8, 9, 10]) {
    const { studentProfile } = createdStudents[n];
    await enroll(studentProfile, aiOfferingBCA);
    await enroll(studentProfile, dataStructuresOffering);
  }

  // ---------------------------------------------------------------------
  // Sample assessments in different states — enough to see every badge on
  // both the teacher submissions view and the student dashboard.
  // ---------------------------------------------------------------------
  const [aiQuiz] = await Assessment.findOrCreate({
    where: { subjectOfferingId: aiOfferingBBA.id, title: "Week 1 Quiz: What is AI?" },
    defaults: {
      createdById: meera.user.id,
      description: "Short quiz covering the basics from week 1.",
      startAt: new Date("2026-08-01"),
      endAt: new Date("2027-06-01"),
      maxMarks: 10,
      isActive: true,
    },
  });
  // Target the assessment at the actual leaf sections students sit in
  // (the sub-groups + Section B) — this is the "select exactly which
  // sections" behavior the multi-section picker is built around.
  for (const sectionId of [bbaSectionAPG1.id, bbaSectionAPG2.id, bbaSectionB.id]) {
    await AssessmentSection.findOrCreate({ where: { assessmentId: aiQuiz.id, sectionId } });
  }

  const [legalEssay] = await Assessment.findOrCreate({
    where: { subjectOfferingId: legalWritingOffering.id, title: "Case Brief Essay" },
    defaults: {
      createdById: arjun.user.id,
      description: "Write a 500-word case brief on the assigned reading.",
      startAt: new Date("2026-08-01"),
      endAt: new Date("2027-06-01"),
      maxMarks: 20,
      isActive: true,
    },
  });
  await AssessmentSection.findOrCreate({ where: { assessmentId: legalEssay.id, sectionId: llbSectionA.id } });

  // stu1: submitted AND evaluated
  const stu1 = createdStudents[1];
  const [stu1Submission] = await Submission.findOrCreate({
    where: { assessmentId: aiQuiz.id, studentId: stu1.studentProfile.id },
    defaults: {
      sectionId: stu1.studentProfile.currentSectionId,
      url: "https://github.com/stu1/week1-quiz",
      status: "EVALUATED",
      marksObtained: 8,
      remarks: "Good understanding of the core concepts.",
      evaluatedById: meera.user.id,
      submittedAt: new Date("2026-08-05"),
    },
  });

  // stu2: submitted, still PENDING evaluation
  const stu2 = createdStudents[2];
  await Submission.findOrCreate({
    where: { assessmentId: aiQuiz.id, studentId: stu2.studentProfile.id },
    defaults: {
      sectionId: stu2.studentProfile.currentSectionId,
      url: "https://github.com/stu2/week1-quiz",
      status: "PENDING",
      submittedAt: new Date("2026-08-06"),
    },
  });

  // stu3, stu4: no submission at all (demonstrates the "not submitted" state)

  console.log("\nSeed complete. Summary:");
  console.log(`  Schools: School of Business, School of Law, School of Computer Science`);
  console.log(`  Programs: BBA (6 sem), LLB (5 sem), BCA (6 sem)`);
  console.log(`  Sections: BBA Section A (+ PG1/PG2 sub-groups) & Section B, LLB Section A, BCA Section A & B`);
  console.log(`  Subjects: AI for All (university-wide, across all 3 programs), Data Ethics, Corporate Finance, Legal Writing, Data Structures`);
  console.log(`  Teachers: teacher@aiwatch.local (Meera/BBA), arjun@aiwatch.local (LLB), priya@aiwatch.local (BCA) — all password ${DEFAULT_PASSWORD}`);
  console.log(`  Students: stu1..stu10@student.local — all password ${DEFAULT_PASSWORD} (stu10 pending approval)`);
  console.log(`  Sample assessments: "Week 1 Quiz" (BBA, one evaluated + one pending + two not submitted), "Case Brief Essay" (LLB, unsubmitted)`);
  console.log(`\nLog in at /login, or start a student sign-up at /signup/student.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
