/**
 * Opt-in: lists reservations that were "approved" before the move-in step existed. They now
 * show as Reserved, so billing and new maintenance reports wait until the landlord clicks
 * Confirm move-in. This script lets you do that step in bulk for stays that really started.
 *
 *   npm run reservations:confirm-move-ins                          -> dry run: lists them, changes nothing
 *   npm run reservations:confirm-move-ins -- --apply                -> marks all listed ones as moved in
 *   npm run reservations:confirm-move-ins -- --apply --ids=<id>,<id> -> only the given reservations
 *
 * "Moved in" = status 'active' with movedInAt set (approvedAt, or now if missing). Nothing is
 * deleted, room slot counts don't change (approval already holds the slot), no email or
 * notification is sent, and each change is written to the audit log.
 * It connects to MONGODB_URI from backend/.env, which is the live database.
 */
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const ReservationRepository = require('../repositories/ReservationRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const { RESERVATION_STATUS } = require('./constants');

const apply = process.argv.includes('--apply');
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const onlyIds = idsArg ? new Set(idsArg.slice('--ids='.length).split(',').map((id) => id.trim()).filter(Boolean)) : null;
// eslint-disable-next-line no-console
const log = (...args) => console.log('[confirm-move-ins]', ...args);

async function main() {
  await connectDB();
  log(`Mode: ${apply ? 'APPLY' : 'dry run (add --apply to change data)'}${onlyIds ? `, limited to ${onlyIds.size} id(s)` : ''}`);

  const reserved = await ReservationRepository.find(
    { status: RESERVATION_STATUS.APPROVED },
    { populate: 'tenantId roomId propertyId', sort: { approvedAt: 1 } }
  );
  const selected = onlyIds ? reserved.filter((r) => onlyIds.has(String(r._id))) : reserved;

  log(`${reserved.length} reservation(s) are approved but not yet confirmed as moved in${onlyIds ? `; ${selected.length} selected` : ''}:`);
  selected.forEach((r) => log(`  ${r._id} | ${r.tenantId?.fullName || r.tenantId} | ${r.propertyId?.propertyName || r.propertyId}, Room ${r.roomId?.roomNumber || r.roomId} | move-in ${r.moveInDate?.toISOString().slice(0, 10)} | approved ${r.approvedAt ? r.approvedAt.toISOString().slice(0, 10) : 'unknown'}`));

  // One current stay per tenant: if a tenant has several, only their earliest-approved one is confirmed.
  const confirmedTenants = new Set((await ReservationRepository.find({ status: RESERVATION_STATUS.ACTIVE }, { select: 'tenantId' })).map((r) => String(r.tenantId)));

  if (!apply) {
    log('Dry run complete. Nothing was changed.');
    return;
  }

  let changed = 0;
  for (const reservation of selected) {
    const tenantId = String(reservation.tenantId?._id || reservation.tenantId);
    if (confirmedTenants.has(tenantId)) {
      log(`  skipped ${reservation._id}: this tenant already has a current stay.`);
      continue;
    }
    /* eslint-disable no-await-in-loop */
    await ReservationRepository.updateById(reservation._id, {
      status: RESERVATION_STATUS.ACTIVE,
      movedInAt: reservation.approvedAt || new Date(),
    });
    await AuditLogRepository.record({
      action: 'RESERVATION_ACTIVE',
      actorRole: 'system',
      targetType: 'Reservation',
      targetId: reservation._id,
      metadata: { from: RESERVATION_STATUS.APPROVED, to: RESERVATION_STATUS.ACTIVE, source: 'confirmExistingMoveIns script' },
    });
    /* eslint-enable no-await-in-loop */
    confirmedTenants.add(tenantId);
    changed += 1;
    log(`  confirmed move-in for ${reservation._id}`);
  }
  log(`Done. ${changed} reservation(s) marked as moved in.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[confirm-move-ins] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
