/** Single place that combines firstName + lastName into the stored fullName. */
function deriveFullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

module.exports = { deriveFullName };
