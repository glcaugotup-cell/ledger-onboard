import { BaseApiClient } from './apiClient';

class UtilityApi extends BaseApiClient {
  logReading(payload) {
    return this.post('/utilities/readings', payload);
  }

  logFixedRate(payload) {
    return this.post('/utilities/fixed-rate', payload);
  }

  listByRoom(roomId) {
    return this.get(`/utilities/readings/room/${roomId}`);
  }

  listMine() {
    return this.get('/utilities/readings/mine');
  }
}

export default new UtilityApi();
