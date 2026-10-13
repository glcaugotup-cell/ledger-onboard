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

  /** Main admin only: resolves to { user, code, expiresAt }, the code being a one-time setup code. */
  createAdmin(payload) {
    return this.post('/admin/admins', payload);
  }

  /** One-time password reset code (shown once): resolves to { code, expiresAt }. */
  issueResetCode(id) {
    return this.post(`/admin/users/${id}/reset-code`);
  }

  /** Main admin only: test email to yourself; resolves to { status, reason, advice, ...settings }. */
  sendTestEmail() {
    return this.post('/admin/email-test');
  }

  /** Archive: blocked now, erased after 30 days unless restored. */
  archiveUser(id, reason) {
    return this.post(`/admin/users/${id}/archive`, { reason });
  }

  restoreUser(id) {
    return this.post(`/admin/users/${id}/restore`);
  }

  /** Main admin only: erase an archived account now. */
  deleteUser(id) {
    return this.delete(`/admin/users/${id}`);
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
