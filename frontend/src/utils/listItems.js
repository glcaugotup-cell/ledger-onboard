// Same limits as backend/validators/propertyValidators.js (listItemsChain).
export const MAX_LIST_ITEMS = 30;
export const MAX_LIST_ITEM_LENGTH = 200;

/** "Wi-Fi", "wifi", "WiFi" and "wi fi" are the same entry: compare letters and digits only, ignoring case. */
export function listItemKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
