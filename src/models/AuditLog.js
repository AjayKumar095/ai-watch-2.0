module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "AuditLog",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      action: { type: DataTypes.STRING, allowNull: false },
      entityType: { type: DataTypes.STRING, allowNull: false },
      entityId: { type: DataTypes.STRING, allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true },
    },
    { tableName: "audit_logs" }
  );
};
