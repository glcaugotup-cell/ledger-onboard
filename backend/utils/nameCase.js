/**
 * "angelo" -> "Angelo", "mary-ann" -> "Mary-Ann", "st. john" -> "St. John",
 * "o'connor" -> "O'Connor". A typographic apostrophe (’) becomes a plain one.
 * Runs as a sanitizer before the name pattern check. Mirrored in frontend/src/utils/textFormat.js.
 */
function toNameCase(value) {
  if (!value) return value;
  return value
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/(^|[\s.'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

module.exports = { toNameCase };
