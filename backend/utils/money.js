/** Rounds money half-up to 2 decimal places; the single place the rounding rule lives. */
function roundMoney(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Guards a division, returning 0 instead of NaN/Infinity when denominator is 0. */
function safeDivide(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

module.exports = { roundMoney, safeDivide };
