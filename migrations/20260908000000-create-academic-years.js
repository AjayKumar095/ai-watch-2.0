'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'academic_years',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          year_start: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          year_end: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          label: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          admission_year: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true,
            allowNull: false,
          },
          is_current: {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction: t }
      );

      await queryInterface.addIndex('academic_years', ['admission_year'], {
        unique: true,
        transaction: t,
      });

      // Populate initial academic years based on existing DB years or standard defaults
      const now = new Date();
      const currentYear = now.getFullYear();
      const yearsToSeed = [2025, 2026, 2027, 2028];

      const records = yearsToSeed.map((y) => ({
        id: uuidv4(),
        year_start: y,
        year_end: y + 1,
        label: `${y}-${y + 1}`,
        admission_year: y,
        is_active: true,
        is_current: y === 2026 || y === currentYear,
        created_at: now,
        updated_at: now,
      }));

      await queryInterface.bulkInsert('academic_years', records, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('academic_years');
  },
};
