import { BaseApiClient, UPLOAD_CONFIG } from './apiClient';

class PaymentApi extends BaseApiClient {
  submit(formData) {
    return this.post('/payments', formData, UPLOAD_CONFIG);
  }

  list() {
    return this.get('/payments');
  }

  verify(id, payload) {
    return this.patch(`/payments/${id}/verify`, payload);
  }

  // Proof images are never public, so fetch them as an authenticated blob (not a plain <img src>).
  async fetchProofImageObjectUrl(id) {
    const res = await this.http.get(`/payments/${id}/proof-image`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  }
}

export default new PaymentApi();
