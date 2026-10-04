/**
 * Reservation lifecycle labels shared by tenant, landlord and caretaker screens.
 * The stored status 'approved' is shown as "Reserved" (the slot is held until move-in),
 * and 'active' is the tenant's "Current stay" (after the landlord confirms the move-in).
 */
export const RESERVATION_LABEL = {
  pending: 'Pending',
  approved: 'Reserved',
  active: 'Current stay',
  no_show: 'No-show',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const RESERVATION_TONE = {
  pending: 'yellow',
  approved: 'blue',
  active: 'green',
  no_show: 'gray',
  rejected: 'red',
  cancelled: 'gray',
  completed: 'gray',
};

/** Statuses where the tenant holds or occupies the room. */
export const HELD_STATUSES = ['approved', 'active'];
/** Statuses a tenant can still withdraw. */
export const CANCELLABLE_STATUSES = ['pending', 'approved'];

export const reservationLabel = (status) => RESERVATION_LABEL[status] || status;
