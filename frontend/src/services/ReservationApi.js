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

  reassignCaretaker(id, caretakerId) {
    return this.patch(`/reservations/${id}/caretaker`, { caretakerId });
  }
}

export default new ReservationApi();
