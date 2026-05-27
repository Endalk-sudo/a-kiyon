/**
 * Ethiopian Calendar Utility Library
 *
 * Provides comprehensive utilities for converting between the Ethiopian calendar (EC)
 * and the Gregorian calendar, formatting, parsing, and validating Ethiopian dates.
 *
 * The Ethiopian calendar has 13 months:
 *   - Months 1–12 have 30 days each
 *   - Month 13 (Pagume) has 5 days (6 in a leap year)
 *
 * An Ethiopian year Y is a leap year if Y % 4 === 3.
 * Ethiopian New Year (Meskerem 1) falls on September 11 in the Gregorian calendar,
 * or September 12 in a Gregorian leap year.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ethiopian month names in Amharic */
export const ETH_MONTH_NAMES_AM: readonly string[] = [
  'መስከረም',   // Meskerem
  'ጥቅምት',     // Tikimt
  'ኅዳር',       // Hidar
  'ታኅሣሥ',      // Tahsas
  'ጥር',         // Tir
  'የካቲት',     // Yekatit
  'መጋቢት',     // Megabit
  'ሚያዝያ',     // Miazia
  'ግንቦት',     // Ginbot
  'ሰኔ',         // Sene
  'ሐምሌ',       // Hamle
  'ነሐሴ',       // Nehase
  'ጳጉሜ',       // Pagume
] as const;

/** Ethiopian month names in English */
export const ETH_MONTH_NAMES_EN: readonly string[] = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miazia',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
] as const;

/** Ethiopian day-of-week names in Amharic (Sunday = 0) */
export const ETH_DAY_NAMES_AM: readonly string[] = [
  'እሑድ',     // Sunday
  'ሰኞ',       // Monday
  'ማክሰኞ',   // Tuesday
  'ረቡዕ',     // Wednesday
  'ሐሙስ',     // Thursday
  'ዓርብ',     // Friday
  'ቅዳሜ',     // Saturday
] as const;

/** Ethiopian day-of-week names in English (Sunday = 0) */
export const ETH_DAY_NAMES_EN: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Number of days in each Ethiopian month (1-indexed, index 12 = Pagume) */
const ETH_MONTH_DAYS = [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 5] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents an Ethiopian date with year, month (1–13), and day (1–30/5/6) */
export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
}

/** Result of parsing an Ethiopian date string */
export interface EthiopianParseResult {
  success: boolean;
  date: Date | null;
  ethiopian: EthiopianDate | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given Gregorian year is a leap year.
 */
function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the Gregorian day-of-month on which Ethiopian New Year (Meskerem 1)
 * falls for the given Gregorian year (September 11 or 12).
 */
function ethiopianNewYearGregorianDay(gregorianYear: number): number {
  return isGregorianLeapYear(gregorianYear) ? 12 : 11;
}

// ---------------------------------------------------------------------------
// Core conversion functions
// ---------------------------------------------------------------------------

/**
 * Determine whether an Ethiopian year is a leap year.
 *
 * An Ethiopian year Y is a leap year if `Y % 4 === 3`.
 * In a leap year, Pagume (month 13) has 6 days instead of 5.
 */
export function isEthiopianLeapYear(year: number): boolean {
  return year % 4 === 3;
}

/**
 * Get the number of days in a given Ethiopian month.
 *
 * @param month - Ethiopian month (1–13)
 * @param year  - Ethiopian year (needed for Pagume leap-year check)
 * @returns Number of days in the month
 */
export function daysInEthiopianMonth(month: number, year: number): number {
  if (month < 1 || month > 13) {
    throw new Error(`Invalid Ethiopian month: ${month}. Must be 1–13.`);
  }
  if (month === 13) {
    return isEthiopianLeapYear(year) ? 6 : 5;
  }
  return 30;
}

/**
 * Get the total number of days in an Ethiopian year.
 */
export function daysInEthiopianYear(year: number): number {
  return isEthiopianLeapYear(year) ? 366 : 365;
}

/**
 * Convert a Gregorian (JavaScript Date) to an Ethiopian date.
 *
 * @param date - A JavaScript Date object in the Gregorian calendar
 * @returns An EthiopianDate object with year, month (1–13), and day
 */
export function gregorianToEthiopian(date: Date): EthiopianDate {
  const gYear = date.getFullYear();
  const gMonth = date.getMonth() + 1; // 1–12
  const gDay = date.getDate();

  let ethYear: number;
  let dayOfYear: number;

  if (gMonth > 9 || (gMonth === 9 && gDay >= ethiopianNewYearGregorianDay(gYear))) {
    // We are in the Ethiopian year that started in September of this Gregorian year
    ethYear = gYear - 7;
    const ethNewYear = new Date(gYear, 8, ethiopianNewYearGregorianDay(gYear)); // Sept 11 or 12
    dayOfYear = Math.floor(
      (date.getTime() - ethNewYear.getTime()) / (24 * 60 * 60 * 1000)
    );
  } else {
    // We are in the Ethiopian year that started in September of the previous Gregorian year
    ethYear = gYear - 8;
    const prevNewYearDay = ethiopianNewYearGregorianDay(gYear - 1);
    const ethNewYear = new Date(gYear - 1, 8, prevNewYearDay);
    dayOfYear = Math.floor(
      (date.getTime() - ethNewYear.getTime()) / (24 * 60 * 60 * 1000)
    );
  }

  // Calculate month and day
  let ethMonth: number;
  let ethDay: number;

  if (dayOfYear < 360) {
    ethMonth = Math.floor(dayOfYear / 30) + 1;
    ethDay = (dayOfYear % 30) + 1;
  } else {
    ethMonth = 13;
    ethDay = dayOfYear - 360 + 1;
  }

  return { year: ethYear, month: ethMonth, day: ethDay };
}

/**
 * Convert an Ethiopian date to a Gregorian (JavaScript Date).
 *
 * @param ethYear  - Ethiopian year
 * @param ethMonth - Ethiopian month (1–13)
 * @param ethDay   - Ethiopian day
 * @returns A JavaScript Date object representing the equivalent Gregorian date
 */
export function ethiopianToGregorian(ethYear: number, ethMonth: number, ethDay: number): Date {
  // Number of days into the Ethiopian year (0-indexed)
  const dayOfYear =
    ethMonth <= 12
      ? (ethMonth - 1) * 30 + (ethDay - 1)
      : 360 + (ethDay - 1);

  // The Gregorian year in which this Ethiopian year's New Year falls
  const gYear = ethYear + 7;
  const newYearDay = ethiopianNewYearGregorianDay(gYear);
  const ethNewYear = new Date(gYear, 8, newYearDay); // Sept 11 or 12

  // Add the day offset
  const result = new Date(ethNewYear);
  result.setDate(result.getDate() + dayOfYear);

  return result;
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the Ethiopian year from a Gregorian Date.
 */
export function getEthiopianYear(date: Date): number {
  return gregorianToEthiopian(date).year;
}

/**
 * Extract the Ethiopian month (1–13) from a Gregorian Date.
 */
export function getEthiopianMonth(date: Date): number {
  return gregorianToEthiopian(date).month;
}

/**
 * Extract the Ethiopian day from a Gregorian Date.
 */
export function getEthiopianDay(date: Date): number {
  return gregorianToEthiopian(date).day;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a Gregorian Date as an Ethiopian date string.
 *
 * @param date    - A JavaScript Date object
 * @param options - Optional formatting options
 * @returns A formatted string like "15/08/2017 EC"
 *
 * @example
 * formatEthiopianDate(new Date(2024, 3, 23)) // "15/08/2017 EC"
 * formatEthiopianDate(new Date(2024, 3, 23), { separator: '-', includeEC: false }) // "15-08-2017"
 */
export function formatEthiopianDate(
  date: Date,
  options: {
    separator?: string;
    includeEC?: boolean;
    padZero?: boolean;
  } = {}
): string {
  const { separator = '/', includeEC = true, padZero = true } = options;
  const eth = gregorianToEthiopian(date);

  const dayStr = padZero ? String(eth.day).padStart(2, '0') : String(eth.day);
  const monthStr = padZero ? String(eth.month).padStart(2, '0') : String(eth.month);
  const yearStr = String(eth.year);

  return `${dayStr}${separator}${monthStr}${separator}${yearStr}${includeEC ? ' EC' : ''}`;
}

/**
 * Format a Gregorian Date as a long Ethiopian date string with month name.
 *
 * @param date   - A JavaScript Date object
 * @param locale - 'am' for Amharic or 'en' for English
 * @returns A string like "15 Ginbot 2017 EC" or "15 ግንቦት 2017 EC"
 */
export function formatEthiopianDateLong(
  date: Date,
  locale: 'am' | 'en' = 'en'
): string {
  const eth = gregorianToEthiopian(date);
  const monthNames = locale === 'am' ? ETH_MONTH_NAMES_AM : ETH_MONTH_NAMES_EN;
  const monthName = monthNames[eth.month - 1];

  return `${eth.day} ${monthName} ${eth.year} EC`;
}

/**
 * Get the Ethiopian day-of-week name for a Gregorian Date.
 *
 * @param date   - A JavaScript Date object
 * @param locale - 'am' for Amharic or 'en' for English
 * @returns The day-of-week name
 */
export function getEthiopianDayName(date: Date, locale: 'am' | 'en' = 'en'): string {
  const dayOfWeek = date.getDay(); // 0 = Sunday
  const names = locale === 'am' ? ETH_DAY_NAMES_AM : ETH_DAY_NAMES_EN;
  return names[dayOfWeek];
}

/**
 * Get the Ethiopian month name.
 *
 * @param month  - Ethiopian month number (1–13)
 * @param locale - 'am' for Amharic or 'en' for English
 * @returns The month name
 */
export function getEthiopianMonthName(month: number, locale: 'am' | 'en' = 'en'): string {
  if (month < 1 || month > 13) {
    throw new Error(`Invalid Ethiopian month: ${month}. Must be 1–13.`);
  }
  const names = locale === 'am' ? ETH_MONTH_NAMES_AM : ETH_MONTH_NAMES_EN;
  return names[month - 1];
}

// ---------------------------------------------------------------------------
// Parsing & validation
// ---------------------------------------------------------------------------

/**
 * Validate an Ethiopian date (year, month, day).
 *
 * @returns An error message if invalid, or null if valid.
 */
export function validateEthiopianDate(ethYear: number, ethMonth: number, ethDay: number): string | null {
  if (!Number.isInteger(ethYear) || ethYear < 1) {
    return 'Ethiopian year must be a positive integer.';
  }
  if (!Number.isInteger(ethMonth) || ethMonth < 1 || ethMonth > 13) {
    return 'Ethiopian month must be an integer between 1 and 13.';
  }
  const maxDay = daysInEthiopianMonth(ethMonth, ethYear);
  if (!Number.isInteger(ethDay) || ethDay < 1 || ethDay > maxDay) {
    return `Ethiopian day must be between 1 and ${maxDay} for month ${ethMonth} of year ${ethYear}.`;
  }
  return null;
}

/**
 * Parse an Ethiopian date string in "dd/mm/yyyy" format and return a Date or error.
 *
 * @param input - A string like "15/08/2017" or "15/08/2017 EC"
 * @returns EthiopianParseResult with success status, Date, EthiopianDate, and optional error
 *
 * @example
 * parseEthiopianDate('15/08/2017')
 * parseEthiopianDate('15-08-2017') // also supports dash separator
 */
export function parseEthiopianDate(input: string): EthiopianParseResult {
  if (!input || typeof input !== 'string') {
    return { success: false, date: null, ethiopian: null, error: 'Input is required.' };
  }

  // Strip "EC" suffix and trim
  const cleaned = input.replace(/\s*EC\s*$/i, '').trim();

  // Support both "/" and "-" separators
  const parts = cleaned.split(/[/-]/);
  if (parts.length !== 3) {
    return {
      success: false,
      date: null,
      ethiopian: null,
      error: 'Invalid format. Expected "dd/mm/yyyy" or "dd-mm-yyyy".',
    };
  }

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return {
      success: false,
      date: null,
      ethiopian: null,
      error: 'Day, month, and year must be valid numbers.',
    };
  }

  const validationError = validateEthiopianDate(year, month, day);
  if (validationError) {
    return { success: false, date: null, ethiopian: null, error: validationError };
  }

  const ethiopian: EthiopianDate = { year, month, day };
  const date = ethiopianToGregorian(year, month, day);

  return { success: true, date, ethiopian, error: null };
}

// ---------------------------------------------------------------------------
// Current date
// ---------------------------------------------------------------------------

/**
 * Get the current date in Ethiopian calendar format.
 *
 * @returns An EthiopianDate object representing today
 */
export function getCurrentEthiopianDate(): EthiopianDate {
  return gregorianToEthiopian(new Date());
}

/**
 * Get the current Ethiopian date formatted as a string.
 *
 * @returns A string like "15/08/2017 EC"
 */
export function getCurrentEthiopianDateString(): string {
  return formatEthiopianDate(new Date());
}

// ---------------------------------------------------------------------------
// Date arithmetic
// ---------------------------------------------------------------------------

/**
 * Add a number of days to an Ethiopian date and return the resulting Gregorian Date.
 *
 * Useful for subscription end-date calculations.
 *
 * @param ethYear  - Ethiopian year
 * @param ethMonth - Ethiopian month (1–13)
 * @param ethDay   - Ethiopian day
 * @param days     - Number of days to add (can be negative to subtract)
 * @returns A JavaScript Date representing the result
 */
export function addDaysToEthiopianDate(
  ethYear: number,
  ethMonth: number,
  ethDay: number,
  days: number
): Date {
  const gregDate = ethiopianToGregorian(ethYear, ethMonth, ethDay);
  const result = new Date(gregDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add days to a JavaScript Date and return the result in Ethiopian format.
 *
 * @param date - A JavaScript Date object
 * @param days - Number of days to add (can be negative)
 * @returns An EthiopianDate representing the result
 */
export function addDaysToEthiopianDateFromDate(
  date: Date,
  days: number
): EthiopianDate {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return gregorianToEthiopian(result);
}

/**
 * Calculate the difference in days between two Gregorian Dates.
 *
 * Returns a positive number if `dateB` is after `dateA`, negative otherwise.
 * The calculation is based on calendar days (not 24-hour periods).
 *
 * @param dateA - The first date
 * @param dateB - The second date
 * @returns The number of days difference (dateB - dateA)
 */
export function differenceInDays(dateA: Date, dateB: Date): number {
  // Normalize to midnight UTC to avoid DST issues
  const a = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const b = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());

  const diffMs = b.getTime() - a.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Calculate the difference in days between two Ethiopian dates.
 *
 * Returns a positive number if the second date is after the first.
 *
 * @param ethA - First Ethiopian date
 * @param ethB - Second Ethiopian date
 * @returns The number of days difference
 */
export function differenceInEthiopianDays(
  ethA: EthiopianDate,
  ethB: EthiopianDate
): number {
  const dateA = ethiopianToGregorian(ethA.year, ethA.month, ethA.day);
  const dateB = ethiopianToGregorian(ethB.year, ethB.month, ethB.day);
  return differenceInDays(dateA, dateB);
}

// ---------------------------------------------------------------------------
// Convenience: full date info object
// ---------------------------------------------------------------------------

/**
 * Complete Ethiopian date information for a given Gregorian Date.
 */
export interface EthiopianDateInfo {
  /** Ethiopian year */
  year: number;
  /** Ethiopian month (1–13) */
  month: number;
  /** Ethiopian day */
  day: number;
  /** Ethiopian month name in English */
  monthNameEN: string;
  /** Ethiopian month name in Amharic */
  monthNameAM: string;
  /** Day of the week in English */
  dayNameEN: string;
  /** Day of the week in Amharic */
  dayNameAM: string;
  /** Whether the Ethiopian year is a leap year */
  isLeapYear: boolean;
  /** Day of the Ethiopian year (1–365/366) */
  dayOfYear: number;
  /** Formatted short string "dd/mm/yyyy EC" */
  formatted: string;
  /** Formatted long string in English "15 Ginbot 2017 EC" */
  formattedLongEN: string;
  /** Formatted long string in Amharic "15 ግንቦት 2017 EC" */
  formattedLongAM: string;
}

/**
 * Get comprehensive Ethiopian date information from a Gregorian Date.
 *
 * @param date - A JavaScript Date object
 * @returns A full EthiopianDateInfo object
 */
export function getEthiopianDateInfo(date: Date): EthiopianDateInfo {
  const eth = gregorianToEthiopian(date);
  const dayOfYear =
    eth.month <= 12
      ? (eth.month - 1) * 30 + eth.day
      : 360 + eth.day;

  return {
    year: eth.year,
    month: eth.month,
    day: eth.day,
    monthNameEN: ETH_MONTH_NAMES_EN[eth.month - 1],
    monthNameAM: ETH_MONTH_NAMES_AM[eth.month - 1],
    dayNameEN: ETH_DAY_NAMES_EN[date.getDay()],
    dayNameAM: ETH_DAY_NAMES_AM[date.getDay()],
    isLeapYear: isEthiopianLeapYear(eth.year),
    dayOfYear,
    formatted: formatEthiopianDate(date),
    formattedLongEN: formatEthiopianDateLong(date, 'en'),
    formattedLongAM: formatEthiopianDateLong(date, 'am'),
  };
}
