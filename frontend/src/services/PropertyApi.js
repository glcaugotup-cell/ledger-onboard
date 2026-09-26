import { BaseApiClient, UPLOAD_CONFIG } from './apiClient';

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
    return this.post('/properties', formData, UPLOAD_CONFIG);
  }

  update(id, formData) {
    return this.patch(`/properties/${id}`, formData, UPLOAD_CONFIG);
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

  /** The landlord's caretakers, ranked by whether they work in this property's barangay. */
  listCaretakerSuggestions(id) {
    return this.get(`/properties/${id}/caretakers`);
  }

  assignCaretaker(id, caretakerId) {
    return this.post(`/properties/${id}/caretakers`, { caretakerId });
  }
}

export default new PropertyApi();
