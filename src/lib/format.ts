import { formatEthiopianDate } from './ethiopian-calendar';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).replace('ETB', 'ETB ');
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatEthiopianDate(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatEthiopianDate(d) + ' ' + d.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function formatMemberName(member: { firstName: string; lastName: string }): string {
  return `${member.firstName} ${member.lastName}`;
}

export function formatReceiptNumber(receiptNumber: string): string {
  return receiptNumber;
}

export function formatPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    mobile_money: 'Mobile Money',
  };
  return methods[method] || method;
}

export function formatInvoiceStatus(status: string): string {
  const statuses: Record<string, string> = {
    pending: 'Pending',
    paid: 'Paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  };
  return statuses[status] || status;
}

export function formatSubscriptionStatus(status: string): string {
  const statuses: Record<string, string> = {
    active: 'Active',
    expired: 'Expired',
    cancelled: 'Cancelled',
  };
  return statuses[status] || status;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}
