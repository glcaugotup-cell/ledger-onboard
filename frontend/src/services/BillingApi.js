import { BaseApiClient } from './apiClient';

class BillingApi extends BaseApiClient {
  list() {
    return this.get('/billing/soa');
  }

  getById(id) {
    return this.get(`/billing/soa/${id}`);
  }
}

export default new BillingApi();
