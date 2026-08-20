// Self-referencing hierarchy: a Section with parentSectionId set is a
// sub-group (e.g. "A - PG1") under a top-level Section (e.g. "A"). See
// the schema notes in the architecture report for why this shape was
// chosen over a separate Group table.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Section",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.ENUM("SECTION", "GROUP"), allowNull: false, defaultValue: "SECTION" },
      capacity: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: "sections",
      indexes: [{ unique: true, fields: ["program_offering_id", "parent_section_id", "name"] }],
    }
  );
};
