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
 * "ANGELO" -> "Angelo", "mary-ann" -> "Mary-Ann", "st. john" -> "St. John",
 * "o'connor" -> "O'Connor". A typographic apostrophe (’) becomes a plain one.
 * Applied on blur and submit. Mirrored in backend/utils/nameCase.js.
 */
export function toNameCase(value) {
  if (!value) return value;
  return value
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/(^|[\s.'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Live, as-you-type auto-capitalization for free-text names and labels: only the
 * first letter is raised ("juan" -> "Juan", "o'connor" -> "O'connor"); everything
 * else stays exactly as typed. Never used for emails, passwords, codes, phone
 * numbers or URLs, where capitalization would change the value.
 */
export function capitalizeFirst(value) {
  if (!value) return value;
  return value.replace(/^(\s*)([a-z])/, (_, ws, ch) => ws + ch.toUpperCase());
}
