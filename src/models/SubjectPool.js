// Same label set utils/courseLevel.js's extractLevel() looks for embedded
// in a PROGRAM name — imported (not duplicated) so a subject's own level
// and the certificate-generation level-matching logic can never drift out
// of sync with each other.
const { LEVEL_PATTERNS } = require("../utils/courseLevel");
const LEVEL_VALUES = LEVEL_PATTERNS.map((p) => p.label);

module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "SubjectPool",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      category: {
        type: DataTypes.ENUM("UNIVERSITY_WIDE", "PROGRAM_SPECIFIC"),
        allowNull: false,
        defaultValue: "UNIVERSITY_WIDE",
      },
      // Nullable — plain subjects (e.g. a B.Sc elective) legitimately have
      // no AI-proficiency level at all, so this is optional, not defaulted.
      level: {
        type: DataTypes.ENUM(...LEVEL_VALUES),
        allowNull: true,
        defaultValue: null,
      },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "subject_pool" }
  );
};
