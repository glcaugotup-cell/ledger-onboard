/**
 * "angelo" -> "Angelo", "mary-ann" -> "Mary-Ann", "st. john" -> "St. John".
 * Runs as a sanitizer before the name pattern check. Mirrored in frontend/src/utils/textFormat.js.
 */
function toNameCase(value) {
  if (!value) return value;
  return value.toLowerCase().replace(/(^|[\s.-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

module.exports = { toNameCase };
