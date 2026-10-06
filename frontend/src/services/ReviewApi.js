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

  /** The signed-in tenant's own reviews. */
  listMine() {
    return this.get('/reviews/mine');
  }

  update(id, payload) {
    return this.patch(`/reviews/${id}`, payload);
  }

  /** Soft delete: the review is hidden but kept on record. */
  remove(id) {
    return this.delete(`/reviews/${id}`);
  }

  /** Admin: every review that hasn't been deleted, newest first. */
  listAll() {
    return this.get('/reviews');
  }

  listPendingModeration() {
    return this.get('/reviews/pending');
  }

  moderate(id, payload) {
    return this.patch(`/reviews/${id}/moderate`, payload);
  }
}

export default new ReviewApi();
