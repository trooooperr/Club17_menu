/**
 * Validates an Aadhaar number to ensure it is exactly 12 digits.
 * @param {string} aadhaarNumber - The Aadhaar number.
 * @returns {boolean} True if exactly 12 digits, false otherwise.
 */
export function validateAadhaar(aadhaarNumber) {
  if (!aadhaarNumber) return false;
  
  const clean = aadhaarNumber.toString().replace(/\s+/g, '').replace(/\D/g, '');
  return /^\d{12}$/.test(clean);
}
