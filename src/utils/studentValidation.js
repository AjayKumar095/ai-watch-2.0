const STUDENT_EMAIL_DOMAIN = "@geetauniversity.edu.in";
const ROLL_NO_LENGTH = 10;

function isValidStudentEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(STUDENT_EMAIL_DOMAIN);
}

function isValidRollNo(rollNo) {
  return typeof rollNo === "string" && rollNo.trim().length === ROLL_NO_LENGTH;
}

module.exports = {
  STUDENT_EMAIL_DOMAIN,
  ROLL_NO_LENGTH,
  isValidStudentEmail,
  isValidRollNo,
};
