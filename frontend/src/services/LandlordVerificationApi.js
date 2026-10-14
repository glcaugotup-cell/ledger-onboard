import { BaseApiClient, UPLOAD_CONFIG } from './apiClient';

class LandlordVerificationApi extends BaseApiClient {
  submit(formData) {
    return this.post('/landlord/verification', formData, UPLOAD_CONFIG);
  }

  /** Swaps the permit and/or BIR form on a submission that is still pending review. */
  replaceDocuments(id, formData) {
    return this.patch(`/landlord/verification/${id}/documents`, formData, UPLOAD_CONFIG);
  }

  getMine() {
    return this.get('/landlord/verification/mine');
  }

  // Verification documents are never public — fetched as an authenticated
  // blob and turned into an object URL, same pattern as
  // PaymentApi.fetchProofImageObjectUrl. The caller revokes the URL when done;
  // `type` tells a PDF from an image for the preview.
  async fetchDocument(id, docType) {
    const res = await this.http.get(`/landlord/verification/${id}/document/${docType}`, { responseType: 'blob' });
    return { url: URL.createObjectURL(res.data), type: res.data.type };
  }
}

export default new LandlordVerificationApi();
