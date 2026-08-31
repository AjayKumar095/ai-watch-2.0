const { User } = require("../models");
const { hashPassword, verifyPassword } = require("../utils/password");

exports.showChangePassword = (req, res) => {
  res.render("account/change-password", { title: "Change Password", error: null, success: false });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const render = (error, status = 400) =>
    res.status(status).render("account/change-password", { title: "Change Password", error, success: false });

  if (!currentPassword || !newPassword || !confirmPassword) {
    return render("Please fill in all fields.");
  }
  if (newPassword !== confirmPassword) {
    return render("New password and confirmation don't match.");
  }
  if (newPassword.length < 8) {
    return render("New password must be at least 8 characters.");
  }

  const user = await User.findByPk(req.currentUser.id);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return render("Current password is incorrect.");
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  res.render("account/change-password", { title: "Change Password", error: null, success: true });
};
