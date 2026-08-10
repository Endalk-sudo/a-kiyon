import { NextRequest } from 'next/server';
import { getDocs, getDocsByIds, countDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { apiError } from '@/lib/api';
import { escapeCsv } from '@/lib/format';
import { exportDateRangeWhere } from '@/lib/date-range';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';

// 10k rows keeps exports snappy and bounds member PII / memory in one pull.
const MAX_EXPORT_ROWS = 10_000;

// GET /api/export/payments - Export payments as CSV (owner only). Optional ?startDate=&endDate= (ISO or EC) filter on paymentDate.
export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  // Inclusive range: start of the start day → end of the end day. Malformed
  // input returns a 400 instead of silently exporting nothing or everything.
  const { where, error } = exportDateRangeWhere('paymentDate', startDate, endDate);
  if (error) return apiError(error, 400);

  const total = await countDocs('payments', where);
  if (total > MAX_EXPORT_ROWS) {
    return apiError(`Export too large — narrow the date range (max ${MAX_EXPORT_ROWS} rows)`, 400);
  }

  const payments = await getDocs<{
    memberId: string;
    receiptNumber: string | null;
    amount: number;
    method: string;
    paymentDate: string;
    isVoided: boolean;
  }>('payments', where.length ? where : undefined, ['paymentDate', 'desc']);

  const memberIds = [...new Set(payments.map((p) => p.memberId))];
  const memberDocs = await getDocsByIds<{ firstName: string; lastName: string }>('members', memberIds);
  const membersMap = new Map(memberDocs.map((m) => [m.id, m]));

  const rows = payments.map((payment) => {
    const member = membersMap.get(payment.memberId);
    const memberName = member ? `${member.firstName} ${member.lastName}` : '';
    const receiptNumber = payment.receiptNumber || '';
    // Stored as integer Birr cents — export human-readable Birr.
    const amount = (payment.amount / 100).toFixed(2);
    const method = payment.method || '';
    const paymentDate = new Date(payment.paymentDate);
    const dateEC = Number.isNaN(paymentDate.getTime()) ? '' : formatEthiopianDate(paymentDate);
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
