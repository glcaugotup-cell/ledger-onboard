import { BaseApiClient } from './apiClient';

class BillingApi extends BaseApiClient {
  list() {
    return this.get('/billing/soa');
  }

  getById(id) {
    return this.get(`/billing/soa/${id}`);
  }

  async fetchPaymentQrObjectUrl(soaId) {
    const res = await this.http.get(`/billing/soa/${soaId}/payment-qr`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  }
}

export default new BillingApi();
