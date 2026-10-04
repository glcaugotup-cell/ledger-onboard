import { BaseApiClient } from './apiClient';

class ReservationApi extends BaseApiClient {
  create(payload) {
    return this.post('/reservations', payload);
  }

  list() {
    return this.get('/reservations');
  }

  updateStatus(id, payload) {
    return this.patch(`/reservations/${id}/status`, payload);
  }

  /** Tenant withdraws a pending or reserved request. */
  cancel(id, reason) {
    return this.patch(`/reservations/${id}/status`, { status: 'cancelled', ...(reason ? { reason } : {}) });
  }

  reassignCaretaker(id, caretakerId) {
    return this.patch(`/reservations/${id}/caretaker`, { caretakerId });
  }

  requestLeave(id, note) {
    return this.post(`/reservations/${id}/leave-request`, note ? { note } : {});
  }

  decideLeave(id, payload) {
    return this.patch(`/reservations/${id}/leave-request`, payload);
  }
}

export default new ReservationApi();
