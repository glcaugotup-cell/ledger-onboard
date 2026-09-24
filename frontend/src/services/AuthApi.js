import { BaseApiClient } from './apiClient';

class AuthApi extends BaseApiClient {
  register(payload) {
    return this.post('/auth/register', payload);
  }

  login(payload) {
    return this.post('/auth/login', payload);
  }

  verifyOtp(payload) {
    return this.post('/auth/verify-otp', payload);
  }

  verifyRegistrationOtp({ email, code }) {
    return this.post('/auth/verify-otp', { email, code, purpose: 'email_verification' });
  }

  resendOtp(payload) {
    return this.post('/auth/resend-otp', payload);
  }

  cancelRegistration(payload) {
    return this.post('/auth/cancel-registration', payload);
  }

  logout() {
    return this.post('/auth/logout');
  }

  refresh(refreshToken) {
    return this.post('/auth/refresh', { refreshToken });
  }

  forgotPassword(payload) {
    return this.post('/auth/forgot-password', payload);
  }

  resetPassword(payload) {
    return this.post('/auth/reset-password', payload);
  }

  changePassword(payload) {
    return this.patch('/auth/change-password', payload);
  }

  activateCaretaker(payload) {
    return this.post('/auth/activate-caretaker', payload);
  }

  recoverAccount(payload) {
    return this.post('/auth/account-recovery', payload);
  }

  deactivateAccount() {
    return this.post('/auth/deactivate');
  }

  getMe() {
    return this.get('/users/me');
  }

  updateMe(payload) {
    return this.patch('/users/me', payload);
  }

  setMfaPreference(enabled) {
    return this.patch('/auth/mfa', { enabled });
  }
}

export default new AuthApi();
