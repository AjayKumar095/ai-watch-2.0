// Replaces class in-charge as the account-approval routing mechanism.
// Created at student signup when they pick a teacher to request approval
// from; drives that teacher's "Pending Approvals" dashboard panel.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "ApprovalRequest",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "REASSIGNED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "approval_requests" }
  );
};
