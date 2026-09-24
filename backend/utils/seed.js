/**
 * Seeds demo accounts (one per role) and a sample approved property with a room.
 * Demo passwords are placeholders for local development only. Run: npm run seed
 */
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const UserRepository = require('../repositories/UserRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const RoomRepository = require('../repositories/RoomRepository');
const { hashPassword } = require('./password');
const { ROLES, ACCOUNT_STATUS, LISTING_STATUS, VERIFICATION_STATUS } = require('./constants');

const DEMO_PASSWORD = 'Demo123!Pass';

async function upsertUser(fields) {
  const existing = await UserRepository.findByEmail(fields.email);
  if (existing) return existing;
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return UserRepository.create({
    ...fields,
    passwordHash,
    accountStatus: ACCOUNT_STATUS.ACTIVE,
    privacyConsent: { given: true, at: new Date() },
  });
}

async function main() {
  await connectDB();

  // The admin account is ledgeronboard@gmail.com. User.email is immutable, so the old
  // demo.admin@gmail.com account is removed rather than renamed.
  const staleAdmin = await UserRepository.findByEmail('demo.admin@gmail.com');
  if (staleAdmin) await UserRepository.deleteById(staleAdmin._id);
  const admin = await upsertUser({
    firstName: 'Demo',
    lastName: 'Admin',
    fullName: 'Demo Admin',
    email: 'ledgeronboard@gmail.com',
    phone: '09170000001',
    role: ROLES.ADMIN,
  });

  let landlord = await upsertUser({
    firstName: 'Demo',
    lastName: 'Landlord',
    fullName: 'Demo Landlord',
    email: 'demo.landlord@gmail.com',
    phone: '09170000002',
    role: ROLES.LANDLORD,
    businessVerificationStatus: VERIFICATION_STATUS.VERIFIED, // demo landlord's property-creation flows keep working with no manual verification step
  });
  // upsertUser doesn't update existing accounts, so set this field explicitly.
  if (landlord.businessVerificationStatus !== VERIFICATION_STATUS.VERIFIED) {
    landlord = await UserRepository.updateById(landlord._id, { businessVerificationStatus: VERIFICATION_STATUS.VERIFIED });
  }

  const tenant = await upsertUser({
    firstName: 'Demo',
    lastName: 'Tenant',
    fullName: 'Demo Tenant',
    email: 'demo.tenant@gmail.com',
    phone: '09170000003',
    role: ROLES.TENANT,
    emergencyContact: { name: 'Demo Emergency Contact', phone: '09170000099' },
  });

  const caretaker = await upsertUser({
    firstName: 'Demo',
    lastName: 'Caretaker',
    fullName: 'Demo Caretaker',
    email: 'demo.caretaker@gmail.com',
    phone: '09170000004',
    role: ROLES.CARETAKER,
    assignedLandlordId: landlord._id,
    createdByLandlordId: landlord._id,
  });

  let property = await PropertyRepository.findOne({ landlordId: landlord._id, propertyName: 'Dagupan Demo Boarding House' });
  if (!property) {
    property = await PropertyRepository.create({
      landlordId: landlord._id,
      caretakerIds: [caretaker._id],
      propertyName: 'Dagupan Demo Boarding House',
      description: 'A seeded sample listing for demoing Ledger OnBoard.',
      address: { street: '123 Rizal St', barangay: 'Bonuan', city: 'Dagupan City', province: 'Pangasinan' },
      locationCoordinates: { lat: 16.0433, lng: 120.3333 },
      propertyType: 'Bedspace',
      tenantGenderPolicy: 'Co-Ed',
      nearbyUniversities: ['University of Pangasinan', 'PHINMA UPang'],
      houseRules: ['No smoking indoors', 'Quiet hours after 10 PM'],
      amenities: ['WiFi', 'CCTV', 'Shared kitchen'],
      images: [],
      listingStatus: LISTING_STATUS.APPROVED,
    });
  }

  let room = await RoomRepository.findOne({ propertyId: property._id, roomNumber: '101' });
  if (!room) {
    room = await RoomRepository.create({
      propertyId: property._id,
      roomNumber: '101',
      description: 'Shared room, 2 beds',
      capacity: 2,
      currentOccupancy: 0,
      monthlyBaseRent: 2500,
      status: 'available',
      amenities: ['Fan', 'Study desk'],
    });
  }

  // eslint-disable-next-line no-console
  console.log(`
Seed complete. Demo accounts (placeholder password: ${DEMO_PASSWORD}):
  Admin:     ${admin.email} (use "Forgot Password" to set the real admin password instead of keeping this placeholder)
  Landlord:  ${landlord.email}
  Tenant:    ${tenant.email}
  Caretaker: ${caretaker.email}

Sample listing: "${property.propertyName}" (approved) with Room ${room.roomNumber}.
`);

  await disconnectDB();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});
