const UserRepository = require('../repositories/UserRepository');
const BillingSOARepository = require('../repositories/BillingSOARepository');
const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const FileStorageService = require('./FileStorageService');
const ApiError = require('../utils/ApiError');

const QR_CATEGORY = 'payment-qr-codes';

class PaymentQrService {
  async uploadForLandlord(landlordId, file) {
    if (!file) throw ApiError.badRequest('Upload a GCash QR image', 'PAYMENT_QR_REQUIRED');
    const landlord = await UserRepository.findById(landlordId);
    if (!landlord) throw ApiError.notFound('Account not found', 'USER_NOT_FOUND');

    const previousUrl = landlord.paymentQrUrl;
    const paymentQrUrl = await FileStorageService.saveUpload(file, QR_CATEGORY);
    try {
      await UserRepository.updateById(landlordId, { paymentQrUrl });
    } catch (err) {
      await FileStorageService.deleteByUrls([paymentQrUrl]);
      throw err;
    }
    if (previousUrl) await FileStorageService.deleteByUrls([previousUrl]);
    return { hasPaymentQr: true };
  }

  async getForLandlord(landlordId) {
    const landlord = await UserRepository.findById(landlordId);
    if (!landlord?.paymentQrUrl) throw ApiError.notFound('No GCash QR has been uploaded', 'PAYMENT_QR_NOT_FOUND');
    return FileStorageService.getByUrl(landlord.paymentQrUrl, QR_CATEGORY);
  }

  async getForTenantStatement(tenantId, soaId) {
    const soa = await BillingSOARepository.findById(soaId);
    if (!soa) throw ApiError.notFound('Statement of account not found', 'SOA_NOT_FOUND');
    if (String(soa.tenantId) !== String(tenantId)) {
      throw ApiError.forbidden('This statement of account does not belong to you', 'FORBIDDEN_SOA_ACCESS');
    }

    const room = await RoomRepository.findById(soa.roomId);
    const property = room && await PropertyRepository.findById(room.propertyId);
    const landlord = property && await UserRepository.findById(property.landlordId);
    if (!landlord?.paymentQrUrl) throw ApiError.notFound('The landlord has not uploaded a GCash QR code yet', 'PAYMENT_QR_NOT_FOUND');
    return FileStorageService.getByUrl(landlord.paymentQrUrl, QR_CATEGORY);
  }
}

module.exports = new PaymentQrService();
