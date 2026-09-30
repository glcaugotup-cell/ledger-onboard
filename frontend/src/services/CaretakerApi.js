import { BaseApiClient } from './apiClient';

class CaretakerApi extends BaseApiClient {
  create(payload) {
    return this.post('/landlord/caretakers', payload);
  }

  list() {
    return this.get('/landlord/caretakers');
  }

  update(id, payload) {
    return this.patch(`/landlord/caretakers/${id}`, payload);
  }

  remove(id, reason) {
    return this.delete(`/landlord/caretakers/${id}`, { data: { reason } });
  }
}

export default new CaretakerApi();
