import { BaseApiClient } from './apiClient';

class PropertyApi extends BaseApiClient {
  search(params) {
    return this.get('/properties', { params });
  }

  listMine() {
    return this.get('/properties/mine');
  }

  getPublicDetail(id) {
    return this.get(`/properties/${id}`);
  }

  getForManagement(id) {
    return this.get(`/properties/${id}/manage`);
  }

  create(formData) {
    return this.post('/properties', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  }

  update(id, formData) {
    return this.patch(`/properties/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  }

  remove(id) {
    return this.delete(`/properties/${id}`);
  }

  listRooms(id) {
    return this.get(`/properties/${id}/rooms`);
  }

  createRoom(id, payload) {
    return this.post(`/properties/${id}/rooms`, payload);
  }

  updateRoom(roomId, payload) {
    return this.patch(`/rooms/${roomId}`, payload);
  }
}

export default new PropertyApi();
