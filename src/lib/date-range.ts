import { parseEthiopianDate } from './ethiopian-calendar';
import { ethiopianOrIsoDatePattern } from './schemas';
import type { WhereClause } from './db';

const ethiopianPattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?$/i;
const isoBareDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a user-supplied date into a day or an exact instant.
 *
 * - Ethiopian ("15/08/2017" or "15/08/2017 EC") and bare ISO ("2024-01-15")
 *   dates are DAYS: they map to local midnight, so day boundaries follow the
 *   server's calendar day, not UTC — a date range means the same local days
 *   regardless of the deployment's timezone.
 * - Anything with a time component is an exact INSTANT (stored timestamps are
 *   UTC ISO, so full ISO strings are already absolute).
 *
 * Returns null for anything unparseable.
 */
function parseRangeDate(
  dateStr: string,
): { kind: 'day'; date: Date } | { kind: 'instant'; date: Date } | null {
  if (ethiopianPattern.test(dateStr)) {
    const result = parseEthiopianDate(dateStr);
    if (!result.success || !result.date) return null;
    return { kind: 'day', date: result.date };
  }
  if (isoBareDatePattern.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    return { kind: 'day', date };
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return { kind: 'instant', date: parsed };
}

/**
 * ISO string for the START of the given date. Day inputs become local
 * midnight; exact instants pass through unchanged.
 */
export function toStartOfDayIso(dateStr: string): string | null {
  const parsed = parseRangeDate(dateStr);
  if (!parsed) return null;
  return parsed.date.toISOString();
}

/**
 * ISO string for the END of the given date. Day inputs become local
 * 23:59:59.999 so an inclusive "end date" covers the whole day; exact
 * instants pass through unchanged.
 */
export function toEndOfDayIso(dateStr: string): string | null {
  const parsed = parseRangeDate(dateStr);
  if (!parsed) return null;
  if (parsed.kind === 'instant') return parsed.date.toISOString();
  const end = new Date(parsed.date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

/**
 * Build the Firestore `where` clauses for an inclusive date-range filter
 * (start of the start day → end of the end day). Malformed input returns a
 * user-facing `error` instead of silently exporting nothing or everything.
 */
export function exportDateRangeWhere(
  dateField: 'createdAt' | 'paymentDate',
  startDate?: string | null,
  endDate?: string | null,
): { where: WhereClause[]; error?: string } {
  const where: WhereClause[] = [];
  if (startDate) {
    if (!ethiopianOrIsoDatePattern.test(startDate)) {
      return { where, error: 'Invalid start date format' };
    }
    const start = toStartOfDayIso(startDate);
    if (!start) return { where, error: 'Invalid start date' };
    where.push([dateField, '>=', start]);
  }
  if (endDate) {
    if (!ethiopianOrIsoDatePattern.test(endDate)) {
      return { where, error: 'Invalid end date format' };
    }
    const end = toEndOfDayIso(endDate);
    if (!end) return { where, error: 'Invalid end date' };
    where.push([dateField, '<=', end]);
  }
  return { where };
}
