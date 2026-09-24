import { BaseApiClient } from './apiClient';

class AnalyticsApi extends BaseApiClient {
  getLandlordAnalytics(params) {
    return this.get('/analytics/landlord', { params });
  }
}

export default new AnalyticsApi();
