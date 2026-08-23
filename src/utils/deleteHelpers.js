// Shared helper for delete routes: Sequelize throws ForeignKeyConstraintError
// when a row has dependents (e.g. deleting a School that still has Programs).
// This turns that into a friendly redirect-with-message instead of a 500.
async function safeDestroy(instance, res, redirectTo, entityLabel) {
  try {
    await instance.destroy();
    return true;
  } catch (err) {
    if (err.name === "SequelizeForeignKeyConstraintError") {
      res.status(409).render("error", {
        title: "Can't delete",
        message: `This ${entityLabel} still has other records depending on it (e.g. programs, mappings, or enrollments). Remove those first, or deactivate it instead of deleting.`,
      });
      return false;
    }
    throw err;
  }
}

module.exports = { safeDestroy };
