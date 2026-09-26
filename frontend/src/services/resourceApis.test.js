import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import instance, { UPLOAD_CONFIG } from './apiClient.js';
import AdminApi from './AdminApi.js';
import AnalyticsApi from './AnalyticsApi.js';
import AuthApi from './AuthApi.js';
import BillingApi from './BillingApi.js';
import CaretakerApi from './CaretakerApi.js';
import NotificationApi from './NotificationApi.js';
import PaymentApi from './PaymentApi.js';
import PropertyApi from './PropertyApi.js';
import ReservationApi from './ReservationApi.js';
import ReviewApi from './ReviewApi.js';
import UtilityApi from './UtilityApi.js';

// Every resource client is a singleton built on the shared axios `instance`
// (BaseApiClient's default `http` param), so spying on that one object's
// verbs covers every class below without touching the network.
const envelope = (data) => ({ data: { success: true, data } });

describe('resource API clients', () => {
  beforeEach(() => {
    vi.spyOn(instance, 'get').mockResolvedValue(envelope(null));
    vi.spyOn(instance, 'post').mockResolvedValue(envelope(null));
    vi.spyOn(instance, 'patch').mockResolvedValue(envelope(null));
    vi.spyOn(instance, 'delete').mockResolvedValue(envelope(null));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AuthApi', () => {
    it('posts to the right endpoints with the right bodies', async () => {
      await AuthApi.register({ email: 'a@gmail.com' });
      expect(instance.post).toHaveBeenCalledWith('/auth/register', { email: 'a@gmail.com' }, undefined);

      await AuthApi.login({ email: 'a@gmail.com', password: 'x' });
      expect(instance.post).toHaveBeenCalledWith('/auth/login', { email: 'a@gmail.com', password: 'x' }, undefined);

      await AuthApi.refresh('refresh-token');
      expect(instance.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'refresh-token' }, undefined);

      await AuthApi.logout();
      expect(instance.post).toHaveBeenCalledWith('/auth/logout', undefined, undefined);
    });

    it('patches profile and MFA updates', async () => {
      await AuthApi.changePassword({ oldPassword: 'a', newPassword: 'b' });
      expect(instance.patch).toHaveBeenCalledWith('/auth/change-password', { oldPassword: 'a', newPassword: 'b' }, undefined);

      await AuthApi.setMfaPreference(true);
      expect(instance.patch).toHaveBeenCalledWith('/auth/mfa', { enabled: true }, undefined);

      await AuthApi.updateMe({ firstName: 'Juan' });
      expect(instance.patch).toHaveBeenCalledWith('/users/me', { firstName: 'Juan' }, undefined);
    });

    it('gets the current user', async () => {
      await AuthApi.getMe();
      expect(instance.get).toHaveBeenCalledWith('/users/me', undefined);
    });
  });

  describe('AdminApi', () => {
    it('lists users and audit logs with query params', async () => {
      await AdminApi.listUsers({ role: 'tenant' });
      expect(instance.get).toHaveBeenCalledWith('/admin/users', { params: { role: 'tenant' } });

      await AdminApi.listAuditLogs({ page: 2 });
      expect(instance.get).toHaveBeenCalledWith('/admin/logs', { params: { page: 2 } });
    });

    it('sets user status by id', async () => {
      await AdminApi.setUserStatus('u1', { status: 'archived' });
      expect(instance.patch).toHaveBeenCalledWith('/admin/users/u1/status', { status: 'archived' }, undefined);
    });
  });

  describe('AnalyticsApi', () => {
    it('fetches landlord analytics with params', async () => {
      await AnalyticsApi.getLandlordAnalytics({ range: '30d' });
      expect(instance.get).toHaveBeenCalledWith('/analytics/landlord', { params: { range: '30d' } });
    });
  });

  describe('BillingApi', () => {
    it('lists and fetches a single statement of account', async () => {
      await BillingApi.list();
      expect(instance.get).toHaveBeenCalledWith('/billing/soa', undefined);

      await BillingApi.getById('soa1');
      expect(instance.get).toHaveBeenCalledWith('/billing/soa/soa1', undefined);
    });
  });

  describe('CaretakerApi', () => {
    it('creates, lists, and updates caretakers', async () => {
      await CaretakerApi.create({ email: 'c@gmail.com' });
      expect(instance.post).toHaveBeenCalledWith('/landlord/caretakers', { email: 'c@gmail.com' }, undefined);

      await CaretakerApi.list();
      expect(instance.get).toHaveBeenCalledWith('/landlord/caretakers', undefined);

      await CaretakerApi.update('ct1', { active: false });
      expect(instance.patch).toHaveBeenCalledWith('/landlord/caretakers/ct1', { active: false }, undefined);
    });
  });

  describe('NotificationApi', () => {
    it('lists with params and marks read', async () => {
      await NotificationApi.list({ unreadOnly: true });
      expect(instance.get).toHaveBeenCalledWith('/notifications', { params: { unreadOnly: true } });

      await NotificationApi.markRead('n1');
      expect(instance.patch).toHaveBeenCalledWith('/notifications/n1/read', undefined, undefined);

      await NotificationApi.markAllRead();
      expect(instance.patch).toHaveBeenCalledWith('/notifications/read-all', undefined, undefined);
    });
  });

  describe('PaymentApi', () => {
    it('submits multipart form data and verifies payments', async () => {
      const formData = new FormData();
      await PaymentApi.submit(formData);
      expect(instance.post).toHaveBeenCalledWith('/payments', formData, UPLOAD_CONFIG);

      await PaymentApi.verify('pay1', { approved: true });
      expect(instance.patch).toHaveBeenCalledWith('/payments/pay1/verify', { approved: true }, undefined);
    });

    it('fetches a proof image as an object URL', async () => {
      const blob = new Blob(['fake-image']);
      vi.spyOn(instance, 'get').mockResolvedValueOnce({ data: blob });
      const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
      vi.stubGlobal('URL', { ...URL, createObjectURL });

      const url = await PaymentApi.fetchProofImageObjectUrl('pay1');

      expect(instance.get).toHaveBeenCalledWith('/payments/pay1/proof-image', { responseType: 'blob' });
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(url).toBe('blob:fake-url');
      vi.unstubAllGlobals();
    });
  });

  describe('PropertyApi', () => {
    it('searches, lists, and fetches property detail', async () => {
      await PropertyApi.search({ city: 'Dagupan' });
      expect(instance.get).toHaveBeenCalledWith('/properties', { params: { city: 'Dagupan' } });

      await PropertyApi.listMine();
      expect(instance.get).toHaveBeenCalledWith('/properties/mine', undefined);

      await PropertyApi.getPublicDetail('p1');
      expect(instance.get).toHaveBeenCalledWith('/properties/p1', undefined);
    });

    it('creates and updates via multipart form data, and deletes/lists rooms', async () => {
      const formData = new FormData();
      await PropertyApi.create(formData);
      expect(instance.post).toHaveBeenCalledWith('/properties', formData, UPLOAD_CONFIG);

      await PropertyApi.update('p1', formData);
      expect(instance.patch).toHaveBeenCalledWith('/properties/p1', formData, UPLOAD_CONFIG);

      await PropertyApi.remove('p1');
      expect(instance.delete).toHaveBeenCalledWith('/properties/p1', undefined);

      await PropertyApi.createRoom('p1', { label: '101' });
      expect(instance.post).toHaveBeenCalledWith('/properties/p1/rooms', { label: '101' }, undefined);

      await PropertyApi.updateRoom('r1', { status: 'occupied' });
      expect(instance.patch).toHaveBeenCalledWith('/rooms/r1', { status: 'occupied' }, undefined);
    });
  });

  describe('ReservationApi', () => {
    it('creates, lists, and updates status', async () => {
      await ReservationApi.create({ roomId: 'r1' });
      expect(instance.post).toHaveBeenCalledWith('/reservations', { roomId: 'r1' }, undefined);

      await ReservationApi.list();
      expect(instance.get).toHaveBeenCalledWith('/reservations', undefined);

      await ReservationApi.updateStatus('res1', { status: 'approved' });
      expect(instance.patch).toHaveBeenCalledWith('/reservations/res1/status', { status: 'approved' }, undefined);
    });
  });

  describe('ReviewApi', () => {
    it('lists, submits, and moderates reviews', async () => {
      await ReviewApi.listForProperty('p1');
      expect(instance.get).toHaveBeenCalledWith('/properties/p1/reviews', undefined);

      await ReviewApi.submit('p1', { rating: 5 });
      expect(instance.post).toHaveBeenCalledWith('/properties/p1/reviews', { rating: 5 }, undefined);

      await ReviewApi.listEligible();
      expect(instance.get).toHaveBeenCalledWith('/reviews/eligible', undefined);

      await ReviewApi.moderate('rev1', { approved: false });
      expect(instance.patch).toHaveBeenCalledWith('/reviews/rev1/moderate', { approved: false }, undefined);
    });
  });

  describe('UtilityApi', () => {
    it('logs a reading and lists by room', async () => {
      await UtilityApi.logReading({ roomId: 'r1', value: 42 });
      expect(instance.post).toHaveBeenCalledWith('/utilities/readings', { roomId: 'r1', value: 42 }, undefined);

      await UtilityApi.listByRoom('r1');
      expect(instance.get).toHaveBeenCalledWith('/utilities/readings/room/r1', undefined);
    });
  });
});
