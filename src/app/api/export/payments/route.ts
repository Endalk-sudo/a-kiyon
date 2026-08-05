import { NextRequest } from 'next/server';
import { getDocs, getDocsByIds, type WhereClause } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';

// GET /api/export/payments - Export payments as CSV (manager + owner). Optional ?startDate=&endDate= (ISO) filter on paymentDate.
export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const where: WhereClause[] = [];
  if (startDate) where.push(['paymentDate', '>=', startDate]);
  if (endDate) where.push(['paymentDate', '<=', endDate]);

  const payments = await getDocs<any>('payments', where.length ? where : undefined, ['paymentDate', 'desc']);

  const memberIds = [...new Set(payments.map((p) => p.memberId))];
  const memberDocs = await getDocsByIds<{ firstName: string; lastName: string }>('members', memberIds);
  const membersMap = new Map(memberDocs.map((m) => [m.id, m]));

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const rows = payments.map((payment) => {
    const member = membersMap.get(payment.memberId);
    const memberName = member ? `${member.firstName} ${member.lastName}` : '';
    const receiptNumber = payment.receiptNumber || '';
    const amount = String(payment.amount);
    const method = payment.method || '';
    const dateEC = formatEthiopianDate(new Date(payment.paymentDate));
    const voided = payment.isVoided ? 'Yes' : 'No';

    return [
      escapeCsv(receiptNumber),
      escapeCsv(memberName),
      escapeCsv(amount),
      escapeCsv(method),
      escapeCsv(dateEC),
      escapeCsv(voided),
    ].join(',');
  });

  const headers = ['Receipt#', 'Member', 'Amount', 'Method', 'Date (EC)', 'Voided'];
  const csvContent = [headers.join(','), ...rows].join('\n');

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="payments_export.csv"',
    },
  });
});
