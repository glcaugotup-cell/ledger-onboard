import { BaseApiClient, UPLOAD_CONFIG } from './apiClient';

class StudentVerificationApi extends BaseApiClient {
  submit(formData) {
    return this.post('/student-verification', formData, UPLOAD_CONFIG);
  }

  /** Swaps the front and/or back photo on a submission that is still pending review. */
  replaceDocuments(id, formData) {
    return this.patch(`/student-verification/${id}/documents`, formData, UPLOAD_CONFIG);
  }

  getMine() {
    return this.get('/student-verification/mine');
  }

  // ID photos are never public: fetched as an authenticated blob and turned into an object URL,
  // like LandlordVerificationApi.fetchDocument. The caller revokes the URL when done.
  async fetchDocument(id, side) {
    const res = await this.http.get(`/student-verification/${id}/document/${side}`, { responseType: 'blob' });
    return { url: URL.createObjectURL(res.data), type: res.data.type };
  }
}

export default new StudentVerificationApi();
