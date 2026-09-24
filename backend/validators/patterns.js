/** Shared validation regexes. */
module.exports = {
  FULL_NAME: /^[A-Z][a-zA-Z\s.-]{1,}$/,
  GMAIL: /^[a-zA-Z0-9._%+-]+@gmail\.com$/,
  PH_PHONE: /^(09\d{9}|\+639\d{9})$/,
  OTP: /^\d{6}$/,
  STRONG_PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
};
