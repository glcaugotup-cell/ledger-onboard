import { BaseApiClient } from './apiClient';

class UtilityApi extends BaseApiClient {
  logReading(payload) {
    return this.post('/utilities/readings', payload);
  }

  listByRoom(roomId) {
    return this.get(`/utilities/readings/room/${roomId}`);
  }
}

export default new UtilityApi();
