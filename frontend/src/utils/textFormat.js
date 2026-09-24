/** "arellano street" -> "Arellano Street". Applied on blur, not while typing. */
export function toTitleCase(value) {
  if (!value) return value;
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** Capitalizes only the first letter (for sentences such as house rules). */
export function toSentenceCase(value) {
  if (!value) return value;
  return value.replace(/^(\s*)(\S)/, (_, ws, ch) => ws + ch.toUpperCase());
}

/**
 * "ANGELO" -> "Angelo", "mary-ann" -> "Mary-Ann", "st. john" -> "St. John".
 * Mirrored in backend/utils/nameCase.js.
 */
export function toNameCase(value) {
  if (!value) return value;
  return value.toLowerCase().replace(/(^|[\s.-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}
