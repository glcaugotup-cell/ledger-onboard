import { BaseApiClient } from './apiClient';

class NotificationApi extends BaseApiClient {
  list(params) {
    return this.get('/notifications', { params });
  }

  markRead(id) {
    return this.patch(`/notifications/${id}/read`);
  }

  markAllRead() {
    return this.patch('/notifications/read-all');
  }
}

export default new NotificationApi();
