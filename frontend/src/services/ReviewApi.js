import { BaseApiClient } from './apiClient';

class ReviewApi extends BaseApiClient {
  listForProperty(propertyId) {
    return this.get(`/properties/${propertyId}/reviews`);
  }

  submit(propertyId, payload) {
    return this.post(`/properties/${propertyId}/reviews`, payload);
  }

  listEligible() {
    return this.get('/reviews/eligible');
  }

  listPendingModeration() {
    return this.get('/reviews/pending');
  }

  moderate(id, payload) {
    return this.patch(`/reviews/${id}/moderate`, payload);
  }
}

export default new ReviewApi();
