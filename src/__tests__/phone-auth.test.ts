import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  isValidPhone,
  phoneToEmail,
  emailToPhone,
  isSyntheticEmail,
} from '@/lib/phone-auth';

describe('phone-auth helpers', () => {
  describe('normalizePhone', () => {
    it('keeps full +251 numbers', () => {
      expect(normalizePhone('+251911000000')).toBe('+251911000000');
    });

    it('strips the leading 0 of local format', () => {
      expect(normalizePhone('0911000000')).toBe('+251911000000');
    });

    it('strips the country code without plus', () => {
      expect(normalizePhone('251911000000')).toBe('+251911000000');
    });

    it('ignores spaces and dashes', () => {
      expect(normalizePhone('+251 911 000 000')).toBe('+251911000000');
      expect(normalizePhone('+251-911-000-000')).toBe('+251911000000');
    });

    it('truncates over-long numbers', () => {
      expect(normalizePhone('+25191100000099')).toBe('+251911000000');
    });
  });

  describe('isValidPhone', () => {
    it('accepts valid +251 numbers', () => {
      expect(isValidPhone('+251911000000')).toBe(true);
    });

    it('rejects other formats', () => {
      expect(isValidPhone('0911000000')).toBe(false);
      expect(isValidPhone('+25191100000')).toBe(false);
      expect(isValidPhone('+251811000000')).toBe(false);
    });
  });

  describe('phoneToEmail / emailToPhone', () => {
    it('maps a phone to its synthetic email and back', () => {
      const email = phoneToEmail('+251911000000');
      expect(email).toBe('251911000000@a-kiyon.app');
      expect(emailToPhone(email)).toBe('+251911000000');
    });

    it('normalizes before mapping', () => {
      expect(phoneToEmail('0911000000')).toBe('251911000000@a-kiyon.app');
    });

    it('returns null for non-synthetic emails', () => {
      expect(emailToPhone('owner@fcms.com')).toBeNull();
      expect(emailToPhone('251911000000@gmail.com')).toBeNull();
    });

    it('isSyntheticEmail detects our domain only', () => {
      expect(isSyntheticEmail('251911000000@a-kiyon.app')).toBe(true);
      expect(isSyntheticEmail('owner@fcms.com')).toBe(false);
    });
  });
});
