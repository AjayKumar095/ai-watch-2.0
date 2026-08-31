'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'schools',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'academic_sessions',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      label: { type: Sequelize.STRING, allowNull: false, unique: true },
      start_date: { type: Sequelize.DATEONLY, allowNull: false },
      end_date: { type: Sequelize.DATEONLY, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'subject_pool',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      category: { type: Sequelize.ENUM('UNIVERSITY_WIDE','PROGRAM_SPECIFIC'), allowNull: false, defaultValue: 'UNIVERSITY_WIDE' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'users',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.ENUM('SUPERADMIN','TEACHER','STUDENT'), allowNull: false },
      title: { type: Sequelize.STRING, allowNull: true },
      first_name: { type: Sequelize.STRING, allowNull: false },
      last_name: { type: Sequelize.STRING, allowNull: false },
      profile_image_url: { type: Sequelize.STRING, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'programs',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      total_semesters: { type: Sequelize.INTEGER, allowNull: false },
      duration_years: { type: Sequelize.INTEGER, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      school_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'specializations',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      program_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'program_offerings',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      semester_number: { type: Sequelize.INTEGER, allowNull: false },
      program_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      academic_session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'academic_sessions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'sections',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      kind: { type: Sequelize.ENUM('SECTION','GROUP'), allowNull: false, defaultValue: 'SECTION' },
      capacity: { type: Sequelize.INTEGER, allowNull: true },
      program_offering_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'program_offerings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      parent_section_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'subject_offerings',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      semester_number: { type: Sequelize.INTEGER, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      subject_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'subject_pool', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      program_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      specialization_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'specializations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      academic_session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'academic_sessions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'teacher_profiles',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      employee_code: { type: Sequelize.STRING, allowNull: false, unique: true },
      designation: { type: Sequelize.STRING, allowNull: true },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      school_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'student_profiles',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      roll_no: { type: Sequelize.STRING, allowNull: false, unique: true },
      current_semester_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.ENUM('ACTIVE','GRADUATED','ON_HOLD'), allowNull: false, defaultValue: 'ACTIVE' },
      is_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      program_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      specialization_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'specializations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      current_section_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      academic_session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'academic_sessions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'teacher_subject_mappings',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      teacher_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'teacher_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      subject_offering_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'subject_offerings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      section_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'subject_enrollments',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      subject_offering_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'subject_offerings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      student_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'student_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      section_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'approval_requests',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      status: { type: Sequelize.ENUM('PENDING','APPROVED','REJECTED','REASSIGNED'), allowNull: false, defaultValue: 'PENDING' },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      student_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'student_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      requested_teacher_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'teacher_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      decided_by_user_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'assessments',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.JSON, allowNull: true },
      attachment_url: { type: Sequelize.STRING, allowNull: true },
      start_at: { type: Sequelize.DATE, allowNull: false },
      end_at: { type: Sequelize.DATE, allowNull: false },
      max_marks: { type: Sequelize.DECIMAL(5,1), allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      subject_offering_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'subject_offerings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      created_by_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'assessment_sections',
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      assessment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'assessments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      section_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'assessment_student_overrides',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      start_at: { type: Sequelize.DATE, allowNull: true },
      end_at: { type: Sequelize.DATE, allowNull: true },
      assessment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'assessments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      student_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'student_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'assessment_locks',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      is_locked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      locked_at: { type: Sequelize.DATE, allowNull: true },
      subject_offering_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'subject_offerings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      section_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      locked_by_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'submissions',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      file_url: { type: Sequelize.STRING, allowNull: true },
      url: { type: Sequelize.STRING, allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM('PENDING','REJECTED','EVALUATED'), allowNull: false, defaultValue: 'PENDING' },
      marks_obtained: { type: Sequelize.DECIMAL(5,2), allowNull: true },
      remarks: { type: Sequelize.TEXT, allowNull: true },
      submitted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      is_late: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      assessment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'assessments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      student_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'student_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      section_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      evaluated_by_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'semester_certificates',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      semester_number: { type: Sequelize.INTEGER, allowNull: false },
      verification_code: { type: Sequelize.STRING, allowNull: false, unique: true },
      ai_level: { type: Sequelize.STRING, allowNull: true },
      issued_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      student_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'student_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      program_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      academic_session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'academic_sessions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'promotion_batches',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'PENDING_REVIEW' },
      executed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      program_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      from_session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'academic_sessions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      to_session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'academic_sessions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      executed_by_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'promotion_records',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      from_semester: { type: Sequelize.INTEGER, allowNull: false },
      to_semester: { type: Sequelize.INTEGER, allowNull: true },
      result: { type: Sequelize.ENUM('PROMOTED','GRADUATED','HELD_BACK'), allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      promotion_batch_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'promotion_batches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      student_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'student_profiles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'audit_logs',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      action: { type: Sequelize.STRING, allowNull: false },
      entity_type: { type: Sequelize.STRING, allowNull: false },
      entity_id: { type: Sequelize.STRING, allowNull: false },
      metadata: { type: Sequelize.JSON, allowNull: true },
      user_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.createTable(
        'refresh_tokens',
        {
          id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      token_hash: { type: Sequelize.STRING, allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
          created_at: { type: Sequelize.DATE, allowNull: false },
          updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction: t }
      );

      await queryInterface.addIndex('programs', { unique: true, fields: ['school_id', 'name'], transaction: t });
      await queryInterface.addIndex('specializations', { unique: true, fields: ['program_id', 'name'], transaction: t });
      await queryInterface.addIndex('program_offerings', { unique: true, fields: ['program_id', 'semester_number', 'academic_session_id'], transaction: t });
      await queryInterface.addIndex('sections', { unique: true, fields: ['program_offering_id', 'parent_section_id', 'name'], transaction: t });
      await queryInterface.addIndex('subject_offerings', { unique: true, fields: ['subject_id', 'program_id', 'semester_number', 'specialization_id', 'academic_session_id'], transaction: t });
      await queryInterface.addIndex('teacher_subject_mappings', { unique: true, fields: ['subject_offering_id', 'section_id'], transaction: t });
      await queryInterface.addIndex('subject_enrollments', { unique: true, fields: ['subject_offering_id', 'student_id'], transaction: t });
      await queryInterface.addIndex('assessment_sections', { unique: true, fields: ['assessment_id', 'section_id'], transaction: t });
      await queryInterface.addIndex('assessment_student_overrides', { unique: true, fields: ['assessment_id', 'student_id'], transaction: t });
      await queryInterface.addIndex('assessment_locks', { unique: true, fields: ['subject_offering_id', 'section_id'], transaction: t });
      await queryInterface.addIndex('submissions', { unique: true, fields: ['assessment_id', 'student_id'], transaction: t });
      await queryInterface.addIndex('semester_certificates', { unique: true, fields: ['student_id', 'program_id', 'semester_number', 'academic_session_id'], transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('refresh_tokens', { transaction: t });
      await queryInterface.dropTable('audit_logs', { transaction: t });
      await queryInterface.dropTable('promotion_records', { transaction: t });
      await queryInterface.dropTable('promotion_batches', { transaction: t });
      await queryInterface.dropTable('semester_certificates', { transaction: t });
      await queryInterface.dropTable('submissions', { transaction: t });
      await queryInterface.dropTable('assessment_locks', { transaction: t });
      await queryInterface.dropTable('assessment_student_overrides', { transaction: t });
      await queryInterface.dropTable('assessment_sections', { transaction: t });
      await queryInterface.dropTable('assessments', { transaction: t });
      await queryInterface.dropTable('approval_requests', { transaction: t });
      await queryInterface.dropTable('subject_enrollments', { transaction: t });
      await queryInterface.dropTable('teacher_subject_mappings', { transaction: t });
      await queryInterface.dropTable('student_profiles', { transaction: t });
      await queryInterface.dropTable('teacher_profiles', { transaction: t });
      await queryInterface.dropTable('subject_offerings', { transaction: t });
      await queryInterface.dropTable('sections', { transaction: t });
      await queryInterface.dropTable('program_offerings', { transaction: t });
      await queryInterface.dropTable('specializations', { transaction: t });
      await queryInterface.dropTable('programs', { transaction: t });
      await queryInterface.dropTable('users', { transaction: t });
      await queryInterface.dropTable('subject_pool', { transaction: t });
      await queryInterface.dropTable('academic_sessions', { transaction: t });
      await queryInterface.dropTable('schools', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
