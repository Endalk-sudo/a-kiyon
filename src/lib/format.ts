import { formatEthiopianDate } from './ethiopian-calendar';

export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return formatted.replace('ETB', 'ETB ');
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatEthiopianDate(d);
}

/**
 * Escape a value for a CSV cell. Defends against CSV formula injection
 * (cells starting with = + - @ are prefixed with a tab) and handles quotes,
 * commas, and both newline types.
 */
export function escapeCsv(value: string): string {
  let v = String(value);
  if (/^[=+\-@]/.test(v)) v = `\t${v}`;
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function formatMemberName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`;
}

export function formatPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    mobile_money: 'Mobile Money',
  };
  return methods[method] || method;
}

export function formatSubscriptionStatus(status: string): string {
  const statuses: Record<string, string> = {
    active: 'Active',
    expired: 'Expired',
    cancelled: 'Cancelled',
  };
  return statuses[status] || status;
}
