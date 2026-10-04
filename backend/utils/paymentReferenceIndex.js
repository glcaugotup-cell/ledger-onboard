/**
 * The unique index on GCash reference numbers. It is deliberately NOT declared in the
 * PaymentTransaction schema: Mongoose would then build it on the live database at
 * startup and fail if duplicates already exist. It is created only by the opt-in script
 * (utils/createPaymentReferenceIndex.js --apply) and by the tests' setup.
 *
 * It covers PENDING and VERIFIED payments only, so a tenant whose payment was rejected
 * can resubmit the same real reference. Cash payments (no reference) are ignored.
 */
const PAYMENT_REFERENCE_INDEX_NAME = 'unique_active_reference_number';
const ACTIVE_REFERENCE_STATUSES = ['PENDING', 'VERIFIED'];

const PAYMENT_REFERENCE_INDEX = {
  keys: { referenceNumber: 1 },
  options: {
    name: PAYMENT_REFERENCE_INDEX_NAME,
    unique: true,
    partialFilterExpression: {
      referenceNumber: { $type: 'string' },
      verificationStatus: { $in: ACTIVE_REFERENCE_STATUSES },
    },
  },
};

/** Creates the index on a payment transactions collection (idempotent). */
function ensurePaymentReferenceIndex(collection) {
  return collection.createIndex(PAYMENT_REFERENCE_INDEX.keys, PAYMENT_REFERENCE_INDEX.options);
}

module.exports = { PAYMENT_REFERENCE_INDEX, PAYMENT_REFERENCE_INDEX_NAME, ACTIVE_REFERENCE_STATUSES, ensurePaymentReferenceIndex };
