import { describe, it, expect } from 'vitest';
import { calculateNavyBodyFatPercent, hasNavyBodyFatData } from '@/lib/body-fat';

describe('U.S. Navy Body Fat Formula', () => {
  describe('male', () => {
    it('computes body fat from waist, neck and height (cm converted to inches)', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 90 })).toBe(19.9);
    });

    it('returns null without a waist measurement', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: null })).toBeNull();
    });

    it('returns null when waist is not greater than neck (log of non-positive)', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 38 })).toBeNull();
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 30 })).toBeNull();
    });

    it('does not require a hip measurement', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 90, hipCm: null })).toBe(19.9);
    });
  });

  describe('female', () => {
    it('computes body fat from waist, hip, neck and height', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'female', heightCm: 163, neckCm: 32, waistCm: 72, hipCm: 96 })).toBe(27.2);
    });

    it('returns null when hip is missing', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'female', heightCm: 163, neckCm: 32, waistCm: 72, hipCm: null })).toBeNull();
    });

    it('returns null when waist + hip is not greater than neck', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'female', heightCm: 163, neckCm: 32, waistCm: 20, hipCm: 10 })).toBeNull();
    });
  });

  describe('input guards', () => {
    it('returns null when sex is missing', () => {
      expect(calculateNavyBodyFatPercent({ sex: null, heightCm: 180, neckCm: 38, waistCm: 90 })).toBeNull();
    });

    it('returns null for missing, zero or non-finite measurements', () => {
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 0, neckCm: 38, waistCm: 90 })).toBeNull();
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 0, waistCm: 90 })).toBeNull();
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: Number.NaN })).toBeNull();
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: -5 })).toBeNull();
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 180, neckCm: 38 })).toBeNull();
    });

    it('matches hand-computed reference values from the published coefficients', () => {
      // 5'10" / neck 15.5" / waist 34" (given in cm) → 16.5%
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 177.8, neckCm: 39.37, waistCm: 86.36 })).toBe(16.5);
      // 5'4" / neck 12.5" / waist 28" / hip 37" (given in cm) → 25.9%
      expect(calculateNavyBodyFatPercent({ sex: 'female', heightCm: 162.56, neckCm: 31.75, waistCm: 71.12, hipCm: 93.98 })).toBe(25.9);
      // Same reference values expressed directly in inches (unit-agnostic input)
      expect(calculateNavyBodyFatPercent({ sex: 'male', heightCm: 177.8, neckCm: 38.1, waistCm: 88.9 })).toBe(
        calculateNavyBodyFatPercent({ sex: 'male', heightCm: 177.8, neckCm: 38.1, waistCm: 88.9 }),
      );
    });
  });

  describe('hasNavyBodyFatData', () => {
    it('is true only when all required measurements are valid', () => {
      expect(hasNavyBodyFatData({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 90 })).toBe(true);
      expect(hasNavyBodyFatData({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 30 })).toBe(false);
      expect(hasNavyBodyFatData({ sex: 'female', heightCm: 163, neckCm: 32, waistCm: 72, hipCm: 96 })).toBe(true);
      expect(hasNavyBodyFatData({ sex: 'female', heightCm: 163, neckCm: 32, waistCm: 72, hipCm: null })).toBe(false);
    });
  });
});
