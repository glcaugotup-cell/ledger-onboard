/**
 * The 31 barangays of Dagupan City with approximate centroid coordinates
 * (source: philatlas.com). The property validators use this to reject unknown
 * barangays and coordinates that don't match the chosen barangay.
 *
 * Mirrored in frontend/src/data/dagupanBarangays.js — update both together.
 */
const DAGUPAN_BARANGAYS = [
  { id: 'bacayao-norte', name: 'Bacayao Norte', lat: 16.0322, lng: 120.3444 },
  { id: 'bacayao-sur', name: 'Bacayao Sur', lat: 16.0224, lng: 120.3449 },
  { id: 'barangay-i', name: 'Barangay I', lat: 16.044, lng: 120.3364 },
  { id: 'barangay-ii', name: 'Barangay II', lat: 16.0425, lng: 120.3394 },
  { id: 'barangay-iv', name: 'Barangay IV', lat: 16.0408, lng: 120.336 },
  { id: 'bolosan', name: 'Bolosan', lat: 16.0467, lng: 120.3646 },
  { id: 'bonuan-binloc', name: 'Bonuan Binloc', lat: 16.1018, lng: 120.3798 },
  { id: 'bonuan-boquig', name: 'Bonuan Boquig', lat: 16.0764, lng: 120.3565 },
  { id: 'bonuan-gueset', name: 'Bonuan Gueset', lat: 16.0696, lng: 120.3339 },
  { id: 'calmay', name: 'Calmay', lat: 16.0451, lng: 120.3257 },
  { id: 'carael', name: 'Carael', lat: 16.0387, lng: 120.3163 },
  { id: 'caranglaan', name: 'Caranglaan', lat: 16.0315, lng: 120.3496 },
  { id: 'herrero', name: 'Herrero', lat: 16.0421, lng: 120.3422 },
  { id: 'lasip-chico', name: 'Lasip Chico', lat: 16.0217, lng: 120.3402 },
  { id: 'lasip-grande', name: 'Lasip Grande', lat: 16.0285, lng: 120.3433 },
  { id: 'lomboy', name: 'Lomboy', lat: 16.0548, lng: 120.3248 },
  { id: 'lucao', name: 'Lucao', lat: 16.0141, lng: 120.3241 },
  { id: 'malued', name: 'Malued', lat: 16.0289, lng: 120.3354 },
  { id: 'mamalingling', name: 'Mamalingling', lat: 16.0522, lng: 120.3621 },
  { id: 'mangin', name: 'Mangin', lat: 16.0361, lng: 120.3678 },
  { id: 'mayombo', name: 'Mayombo', lat: 16.0384, lng: 120.3468 },
  { id: 'pantal', name: 'Pantal', lat: 16.0461, lng: 120.3389 },
  { id: 'poblacion-oeste', name: 'Poblacion Oeste', lat: 16.0436, lng: 120.3293 },
  { id: 'pogo-chico', name: 'Pogo Chico', lat: 16.0374, lng: 120.3374 },
  { id: 'pogo-grande', name: 'Pogo Grande', lat: 16.0337, lng: 120.3379 },
  { id: 'pugaro-suit', name: 'Pugaro Suit', lat: 16.0655, lng: 120.3227 },
  { id: 'salapingao', name: 'Salapingao', lat: 16.059, lng: 120.3216 },
  { id: 'salisay', name: 'Salisay', lat: 16.0414, lng: 120.3716 },
  { id: 'tambac', name: 'Tambac', lat: 16.0459, lng: 120.3563 },
  { id: 'tapuac', name: 'Tapuac', lat: 16.0334, lng: 120.3308 },
  { id: 'tebeng', name: 'Tebeng', lat: 16.0345, lng: 120.3601 },
];

// ~1.1 km: tolerates rounding, but rejects coordinates from a different area.
const BARANGAY_COORDINATE_TOLERANCE_DEGREES = 0.01;

function findBarangayByName(name) {
  return DAGUPAN_BARANGAYS.find((b) => b.name === name) || null;
}

function coordinatesMatchBarangay(barangay, lat, lng) {
  if (!barangay) return false;
  return (
    Math.abs(Number(lat) - barangay.lat) <= BARANGAY_COORDINATE_TOLERANCE_DEGREES &&
    Math.abs(Number(lng) - barangay.lng) <= BARANGAY_COORDINATE_TOLERANCE_DEGREES
  );
}

module.exports = { DAGUPAN_BARANGAYS, BARANGAY_COORDINATE_TOLERANCE_DEGREES, findBarangayByName, coordinatesMatchBarangay };
