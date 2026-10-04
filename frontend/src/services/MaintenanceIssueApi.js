import { BaseApiClient } from './apiClient';

class MaintenanceIssueApi extends BaseApiClient {
  list(params) { return this.get('/maintenance-issues', params ? { params } : undefined); }
  create(data) { return this.post('/maintenance-issues', data, { headers: { 'Content-Type': 'multipart/form-data' } }); }
  assign(id, data) { return this.patch(`/maintenance-issues/${id}/assignment`, data); }
  complete(id, workSummary) { return this.patch(`/maintenance-issues/${id}/complete`, { workSummary }); }
  resolve(id, data) { return this.patch(`/maintenance-issues/${id}/resolve`, data, { headers: { 'Content-Type': 'multipart/form-data' } }); }
  confirm(id, solved, note) { return this.patch(`/maintenance-issues/${id}/confirm`, { solved, ...(note ? { note } : {}) }); }
  remove(id, reason) { return this.patch(`/maintenance-issues/${id}/remove`, { reason }); }
  archive(id) { return this.patch(`/maintenance-issues/${id}/archive`); }
  restore(id) { return this.patch(`/maintenance-issues/${id}/restore`); }
  async getMedia(id, kind, index) {
    const response = await this.http.get(`/maintenance-issues/${id}/media/${kind}/${index}`, { responseType: 'blob' });
    return URL.createObjectURL(response.data);
  }
}
export default new MaintenanceIssueApi();
