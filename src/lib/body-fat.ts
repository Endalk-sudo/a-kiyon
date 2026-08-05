export type Sex = 'male' | 'female';

const CM_PER_INCH = 2.54;

function toInches(cm: number | null | undefined): number | null {
  if (cm == null || !isFinite(cm) || cm <= 0) return null;
  return cm / CM_PER_INCH;
}

/**
 * U.S. Navy Body Fat Formula (tape-measurement method).
 *
 * Coefficients are optimized for inches, so all inputs (provided in cm)
 * are converted to inches before applying the equations:
 *   Male:    BF% = 86.010 × log10(waist − neck) − 70.041 × log10(height) + 36.76
 *   Female:  BF% = 163.205 × log10(waist + hip − neck) − 97.684 × log10(height) − 78.387
 *
 * Returns null when the required measurements are missing/invalid or the
 * combination is physiologically impossible (e.g. waist ≤ neck).
 */
export function calculateNavyBodyFatPercent(input: {
  sex: Sex | null | undefined;
  heightCm: number | null | undefined;
  neckCm: number | null | undefined;
  waistCm?: number | null | undefined;
  hipCm?: number | null | undefined;
}): number | null {
  const { sex } = input;
  if (sex !== 'male' && sex !== 'female') return null;

  const heightIn = toInches(input.heightCm);
  const neckIn = toInches(input.neckCm);
  const waistIn = toInches(input.waistCm);
  if (heightIn === null || neckIn === null || waistIn === null) return null;

  if (sex === 'male') {
    const diff = waistIn - neckIn;
    if (diff <= 0) return null;
    return round1(86.01 * Math.log10(diff) - 70.041 * Math.log10(heightIn) + 36.76);
  }

  const hipIn = toInches(input.hipCm);
  if (hipIn === null) return null;
  const diff = waistIn + hipIn - neckIn;
  if (diff <= 0) return null;
  return round1(163.205 * Math.log10(diff) - 97.684 * Math.log10(heightIn) - 78.387);
}

/** True when every measurement needed for the given sex is present and valid. */
export function hasNavyBodyFatData(input: {
  sex: Sex | null | undefined;
  heightCm: number | null | undefined;
  neckCm: number | null | undefined;
  waistCm: number | null | undefined;
  hipCm?: number | null | undefined;
}): boolean {
  return calculateNavyBodyFatPercent(input) !== null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
