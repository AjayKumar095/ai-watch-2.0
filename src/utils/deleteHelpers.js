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

// Bulk-safe variant: never touches `res` (bulk operations process many
// rows and can't have each one render its own response). Returns a plain
// {ok, reason} result so the caller can aggregate outcomes into a single
// summary rendered once at the end.
async function tryDestroy(instance) {
  try {
    await instance.destroy();
    return { ok: true };
  } catch (err) {
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return { ok: false, reason: "still in use" };
    }
    throw err;
  }
}

module.exports = { safeDestroy, tryDestroy };
