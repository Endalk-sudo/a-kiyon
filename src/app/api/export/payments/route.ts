import { NextRequest } from 'next/server';
import { getDocs, getDocById } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';
import { createAuditLog } from '@/lib/audit';

// GET /api/export/payments - Export all payments as CSV (manager + owner)
export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const payments = await getDocs<any>('payments', undefined, ['paymentDate', 'desc']);

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const rows = await Promise.all(payments.map(async (payment) => {
    const member = await getDocById<any>('members', payment.memberId);
    const memberName = member ? `${member.firstName} ${member.lastName}` : '';
    const receiptNumber = payment.receiptNumber || '';
    const amount = String(payment.amount);
    const method = payment.method || '';
    const dateEC = formatEthiopianDate(payment.paymentDate);
    const voided = payment.isVoided ? 'Yes' : 'No';

    return [
      escapeCsv(receiptNumber),
      escapeCsv(memberName),
      escapeCsv(amount),
      escapeCsv(method),
      escapeCsv(dateEC),
      escapeCsv(voided),
    ].join(',');
  }));

  const headers = ['Receipt#', 'Member', 'Amount', 'Method', 'Date (EC)', 'Voided'];
  const csvContent = [headers.join(','), ...rows].join('\n');

  await createAuditLog({
    userId: session.userId,
    action: 'export.payments',
    details: { count: payments.length },
    entity: 'payment',
  });

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="payments_export.csv"',
    },
  });
});
