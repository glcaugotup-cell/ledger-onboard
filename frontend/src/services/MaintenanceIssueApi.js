import { BaseApiClient } from './apiClient';

class MaintenanceIssueApi extends BaseApiClient {
  list() { return this.get('/maintenance-issues'); }
  create(data) { return this.post('/maintenance-issues', data, { headers: { 'Content-Type': 'multipart/form-data' } }); }
  assign(id, data) { return this.patch(`/maintenance-issues/${id}/assignment`, data); }
  complete(id) { return this.patch(`/maintenance-issues/${id}/complete`); }
  resolve(id, data) { return this.patch(`/maintenance-issues/${id}/resolve`, data, { headers: { 'Content-Type': 'multipart/form-data' } }); }
  async getMedia(id, kind, index) {
    const response = await this.http.get(`/maintenance-issues/${id}/media/${kind}/${index}`, { responseType: 'blob' });
    return URL.createObjectURL(response.data);
  }
}
export default new MaintenanceIssueApi();
