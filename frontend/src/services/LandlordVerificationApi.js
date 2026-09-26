import { BaseApiClient, UPLOAD_CONFIG } from './apiClient';

class LandlordVerificationApi extends BaseApiClient {
  submit(formData) {
    return this.post('/landlord/verification', formData, UPLOAD_CONFIG);
  }

  getMine() {
    return this.get('/landlord/verification/mine');
  }

  // Verification documents are never public — fetched as an authenticated
  // blob and turned into an object URL by the caller, same pattern as
  // PaymentApi.fetchProofImageObjectUrl.
  async fetchDocumentObjectUrl(id, docType) {
    const res = await this.http.get(`/landlord/verification/${id}/document/${docType}`, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  }
}

export default new LandlordVerificationApi();
