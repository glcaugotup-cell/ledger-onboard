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

  /** Admin-confirmed deactivation of an account inactive for 60+ days. */
  deactivateInactive(id, reason) {
    return this.post(`/admin/users/${id}/deactivate-inactive`, { reason });
  }

  listPendingLandlordVerifications() {
    return this.get('/admin/landlord-verifications/pending');
  }

  reviewLandlordVerification(id, payload) {
    return this.patch(`/admin/landlord-verifications/${id}/review`, payload);
  }
}

export default new AdminApi();
