/**
 * Opt-in: creates the unique index on GCash reference numbers (see utils/paymentReferenceIndex.js).
 *
 *   npm run index:payment-references            -> dry run: reports duplicates, changes nothing
 *   npm run index:payment-references -- --apply -> creates the index, only if there are no duplicates
 *
 * It never deletes or edits a payment. Duplicates are reported for a person to resolve.
 * It connects to MONGODB_URI from backend/.env, which is the live database.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const { PAYMENT_REFERENCE_INDEX_NAME, ACTIVE_REFERENCE_STATUSES, ensurePaymentReferenceIndex } = require('./paymentReferenceIndex');

const apply = process.argv.includes('--apply');
// eslint-disable-next-line no-console
const log = (...args) => console.log('[payment-reference-index]', ...args);

async function main() {
  await connectDB();
  const info = await mongoose.connection.db.admin().buildInfo();
  log(`MongoDB server version ${info.version}. Mode: ${apply ? 'APPLY' : 'dry run (add --apply to create the index)'}`);

  const collection = mongoose.connection.db.collection('paymenttransactions');
  const existing = (await collection.indexes()).find((index) => index.name === PAYMENT_REFERENCE_INDEX_NAME);
  if (existing) {
    log('The index already exists. Nothing to do.');
    return;
  }

  const duplicates = await collection.aggregate([
    { $match: { referenceNumber: { $type: 'string' }, verificationStatus: { $in: ACTIVE_REFERENCE_STATUSES } } },
    { $group: { _id: '$referenceNumber', count: { $sum: 1 }, payments: { $push: { id: '$_id', status: '$verificationStatus', tenantId: '$tenantId', createdAt: '$createdAt' } } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  const invalidFormat = await collection.countDocuments({ paymentMethod: 'GCASH_QR', referenceNumber: { $type: 'string', $not: /^\d{10,13}$/ } });
  log(`Existing GCash references that don't match the new 10-13 digit rule: ${invalidFormat} (left as they are; the rule applies to new payments).`);

  if (duplicates.length) {
    log(`Found ${duplicates.length} reference number(s) used by more than one pending or verified payment. Nothing was changed:`);
    duplicates.forEach((dup) => log(`  ${dup._id}: ${dup.payments.map((p) => `${p.id} (${p.status})`).join(', ')}`));
    log('Resolve these (for example by rejecting the incorrect payment) before creating the index.');
    process.exitCode = 1;
    return;
  }
  log('No duplicates found.');

  if (!apply) {
    log('Dry run complete. Run again with --apply to create the index.');
    return;
  }
  try {
    await ensurePaymentReferenceIndex(collection);
    log(`Created index "${PAYMENT_REFERENCE_INDEX_NAME}".`);
  } catch (err) {
    log(`The server refused the index (${err.message}). No data was changed. The service-level duplicate check still protects new payments.`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[payment-reference-index] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
