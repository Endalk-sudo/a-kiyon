import { describe, it, expect } from 'vitest';
import {
  gregorianToEthiopian,
  ethiopianToGregorian,
  formatEthiopianDate,
  formatEthiopianDateLong,
  parseEthiopianDate,
  isEthiopianLeapYear,
  daysInEthiopianMonth,
  daysInEthiopianYear,
  validateEthiopianDate,
  getEthiopianYear,
  getEthiopianMonth,
  getEthiopianDay,
  getEthiopianDayName,
  getEthiopianMonthName,
  getCurrentEthiopianDate,
  getCurrentEthiopianDateString,
  getEthiopianDateInfo,
  addDaysToEthiopianDate,
  addDaysToEthiopianDateFromDate,
  differenceInDays,
  differenceInEthiopianDays,
} from '@/lib/ethiopian-calendar';

describe('Ethiopian Calendar', () => {
  describe('isEthiopianLeapYear', () => {
    it('returns true for years where year % 4 === 3', () => {
      expect(isEthiopianLeapYear(2011)).toBe(true);
      expect(isEthiopianLeapYear(2015)).toBe(true);
      expect(isEthiopianLeapYear(2019)).toBe(true);
    });

    it('returns false for non-leap years', () => {
      expect(isEthiopianLeapYear(2010)).toBe(false);
      expect(isEthiopianLeapYear(2012)).toBe(false);
      expect(isEthiopianLeapYear(2013)).toBe(false);
      expect(isEthiopianLeapYear(2014)).toBe(false);
    });
  });

  describe('daysInEthiopianMonth', () => {
    it('returns 30 for months 1-12', () => {
      for (let m = 1; m <= 12; m++) {
        expect(daysInEthiopianMonth(m, 2010)).toBe(30);
      }
    });

    it('returns 5 for Pagume in non-leap year', () => {
      expect(daysInEthiopianMonth(13, 2010)).toBe(5);
    });

    it('returns 6 for Pagume in leap year', () => {
      expect(daysInEthiopianMonth(13, 2011)).toBe(6);
    });

    it('throws for invalid month', () => {
      expect(() => daysInEthiopianMonth(0, 2010)).toThrow();
      expect(() => daysInEthiopianMonth(14, 2010)).toThrow();
    });
  });

  describe('daysInEthiopianYear', () => {
    it('returns 365 for non-leap year', () => {
      expect(daysInEthiopianYear(2010)).toBe(365);
    });

    it('returns 366 for leap year', () => {
      expect(daysInEthiopianYear(2011)).toBe(366);
    });
  });

  describe('gregorianToEthiopian', () => {
    it('converts a known date correctly', () => {
      const result = gregorianToEthiopian(new Date(2024, 3, 23));
      expect(result.year).toBe(2016);
      expect(result.month).toBe(8);
      expect(result.day).toBe(16);
    });

    it('converts a date after Ethiopian New Year (Sept 11/12)', () => {
      const result = gregorianToEthiopian(new Date(2024, 8, 12));
      expect(result.year).toBe(2017);
      expect(result.month).toBe(1);
      expect(result.day).toBe(1);
    });

    it('converts a date before Ethiopian New Year', () => {
      const result = gregorianToEthiopian(new Date(2024, 8, 10));
      expect(result.year).toBe(2016);
      expect(result.month).toBe(13);
      expect(result.day).toBe(6);
    });

    it('handles the epoch correctly', () => {
      const result = gregorianToEthiopian(new Date(1970, 0, 1));
      expect(result.year).toBe(1962);
      expect(result.month).toBe(4);
      expect(result.day).toBe(23);
    });
  });

  describe('ethiopianToGregorian', () => {
    it('converts a known date correctly', () => {
      const result = ethiopianToGregorian(2016, 8, 16);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(3);
      expect(result.getDate()).toBe(23);
    });

    it('round-trips through gregorianToEthiopian', () => {
      const original = new Date(2024, 6, 15);
      const eth = gregorianToEthiopian(original);
      const back = ethiopianToGregorian(eth.year, eth.month, eth.day);
      expect(back.getFullYear()).toBe(original.getFullYear());
      expect(back.getMonth()).toBe(original.getMonth());
      expect(back.getDate()).toBe(original.getDate());
    });
  });

  describe('formatEthiopianDate', () => {
    it('formats with default options', () => {
      const result = formatEthiopianDate(new Date(2024, 3, 23));
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} EC$/);
    });

    it('formats without EC suffix when includeEC=false', () => {
      const result = formatEthiopianDate(new Date(2024, 3, 23), { includeEC: false });
      expect(result).not.toContain('EC');
    });

    it('formats with dash separator', () => {
      const result = formatEthiopianDate(new Date(2024, 3, 23), { separator: '-' });
      expect(result).toContain('-');
      expect(result).not.toContain('/');
    });

    it('formats without padding', () => {
      const result = formatEthiopianDate(new Date(2024, 0, 1), { padZero: false });
      expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4} EC$/);
      expect(result.charAt(0)).not.toBe('0');
    });
  });

  describe('formatEthiopianDateLong', () => {
    it('formats in English', () => {
      const result = formatEthiopianDateLong(new Date(2024, 3, 23), 'en');
      expect(result).toContain('EC');
      expect(result).toMatch(/^\d+ [A-Za-z]+ \d+ EC$/);
    });

    it('formats in Amharic', () => {
      const result = formatEthiopianDateLong(new Date(2024, 3, 23), 'am');
      expect(result).toContain('EC');
    });
  });

  describe('parseEthiopianDate', () => {
    it('parses a valid date with slash separators', () => {
      const result = parseEthiopianDate('15/08/2016');
      expect(result.success).toBe(true);
      expect(result.ethiopian).toEqual({ year: 2016, month: 8, day: 15 });
      expect(result.date).toBeInstanceOf(Date);
    });

    it('parses a valid date with dash separators', () => {
      const result = parseEthiopianDate('15-08-2016');
      expect(result.success).toBe(true);
      expect(result.ethiopian).toEqual({ year: 2016, month: 8, day: 15 });
    });

    it('parses date with EC suffix', () => {
      const result = parseEthiopianDate('15/08/2016 EC');
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const result = parseEthiopianDate('invalid');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('rejects empty input', () => {
      const result = parseEthiopianDate('');
      expect(result.success).toBe(false);
    });

    it('rejects invalid month (14)', () => {
      const result = parseEthiopianDate('01/14/2016');
      expect(result.success).toBe(false);
    });

    it('rejects invalid day for Pagume in non-leap year', () => {
      const result = parseEthiopianDate('06/13/2010');
      expect(result.success).toBe(false);
    });

    it('accepts valid day for Pagume in leap year', () => {
      const result = parseEthiopianDate('06/13/2011');
      expect(result.success).toBe(true);
    });
  });

  describe('validateEthiopianDate', () => {
    it('returns null for a valid date', () => {
      expect(validateEthiopianDate(2016, 8, 15)).toBeNull();
    });

    it('returns error for non-integer year', () => {
      expect(validateEthiopianDate(0, 1, 1)).toBeTruthy();
    });

    it('returns error for month out of range', () => {
      expect(validateEthiopianDate(2016, 0, 1)).toBeTruthy();
      expect(validateEthiopianDate(2016, 14, 1)).toBeTruthy();
    });

    it('returns error for day out of range', () => {
      expect(validateEthiopianDate(2016, 1, 31)).toBeTruthy();
    });
  });

  describe('getEthiopianYear / getEthiopianMonth / getEthiopianDay', () => {
    it('extracts year, month, and day', () => {
      const date = new Date(2024, 3, 23);
      expect(getEthiopianYear(date)).toBe(2016);
      expect(getEthiopianMonth(date)).toBe(8);
      expect(getEthiopianDay(date)).toBe(16);
    });
  });

  describe('getEthiopianDayName', () => {
    it('returns English day name', () => {
      const result = getEthiopianDayName(new Date(2024, 0, 1), 'en');
      expect(result).toBe('Monday');
    });

    it('returns Amharic day name', () => {
      const result = getEthiopianDayName(new Date(2024, 0, 1), 'am');
      expect(typeof result).toBe('string');
    });
  });

  describe('getEthiopianMonthName', () => {
    it('returns English month name', () => {
      expect(getEthiopianMonthName(1, 'en')).toBe('Meskerem');
      expect(getEthiopianMonthName(13, 'en')).toBe('Pagume');
    });

    it('returns Amharic month name', () => {
      expect(getEthiopianMonthName(1, 'am')).toBe('መስከረም');
    });

    it('throws for invalid month', () => {
      expect(() => getEthiopianMonthName(0)).toThrow();
      expect(() => getEthiopianMonthName(14)).toThrow();
    });
  });

  describe('getCurrentEthiopianDate', () => {
    it('returns an EthiopianDate object', () => {
      const result = getCurrentEthiopianDate();
      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('month');
      expect(result).toHaveProperty('day');
      expect(typeof result.year).toBe('number');
    });
  });

  describe('getCurrentEthiopianDateString', () => {
    it('returns a string', () => {
      const result = getCurrentEthiopianDateString();
      expect(typeof result).toBe('string');
      expect(result).toContain('EC');
    });
  });

  describe('addDaysToEthiopianDate', () => {
    it('adds positive days', () => {
      const result = addDaysToEthiopianDate(2016, 8, 15, 30);
      const eth = gregorianToEthiopian(result);
      expect(eth.month).toBe(9);
      expect(eth.day).toBe(15);
    });

    it('subtracts days', () => {
      const result = addDaysToEthiopianDate(2016, 8, 16, -15);
      const eth = gregorianToEthiopian(result);
      expect(eth.month).toBe(8);
      expect(eth.day).toBe(1);
    });
  });

  describe('addDaysToEthiopianDateFromDate', () => {
    it('returns an EthiopianDate', () => {
      const result = addDaysToEthiopianDateFromDate(new Date(2024, 3, 23), 30);
      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('month');
      expect(result).toHaveProperty('day');
    });
  });

  describe('differenceInDays', () => {
    it('calculates positive difference', () => {
      const a = new Date(2024, 0, 1);
      const b = new Date(2024, 0, 11);
      expect(differenceInDays(a, b)).toBe(10);
    });

    it('calculates negative difference', () => {
      const a = new Date(2024, 0, 11);
      const b = new Date(2024, 0, 1);
      expect(differenceInDays(a, b)).toBe(-10);
    });

    it('returns 0 for same date', () => {
      const a = new Date(2024, 0, 1);
      const b = new Date(2024, 0, 1);
      expect(differenceInDays(a, b)).toBe(0);
    });
  });

  describe('differenceInEthiopianDays', () => {
    it('calculates difference between two Ethiopian dates', () => {
      const ethA = { year: 2016, month: 1, day: 1 };
      const ethB = { year: 2016, month: 1, day: 11 };
      expect(differenceInEthiopianDays(ethA, ethB)).toBe(10);
    });
  });

  describe('getEthiopianDateInfo', () => {
    it('returns comprehensive date info', () => {
      const info = getEthiopianDateInfo(new Date(2024, 3, 23));
      expect(info.year).toBe(2016);
      expect(info.month).toBe(8);
      expect(info.day).toBe(16);
      expect(typeof info.monthNameEN).toBe('string');
      expect(typeof info.monthNameAM).toBe('string');
      expect(typeof info.dayNameEN).toBe('string');
      expect(typeof info.dayNameAM).toBe('string');
      expect(typeof info.isLeapYear).toBe('boolean');
      expect(typeof info.dayOfYear).toBe('number');
      expect(info.formatted).toContain('EC');
      expect(info.formattedLongEN).toContain('EC');
      expect(info.formattedLongAM).toContain('EC');
    });
  });
});
