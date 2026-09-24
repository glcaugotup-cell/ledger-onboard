import { BaseApiClient } from './apiClient';

class AdminApi extends BaseApiClient {
  listUsers(params) {
    return this.get('/admin/users', { params });
  }

  listAuditLogs(params) {
    return this.get('/admin/logs', { params });
  }

  setUserStatus(id, payload) {
    return this.patch(`/admin/users/${id}/status`, payload);
  }

  listPendingLandlordVerifications() {
    return this.get('/admin/landlord-verifications/pending');
  }

  reviewLandlordVerification(id, payload) {
    return this.patch(`/admin/landlord-verifications/${id}/review`, payload);
  }
}

export default new AdminApi();
