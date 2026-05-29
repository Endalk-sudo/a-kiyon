import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';
import { createAuditLog } from '@/lib/audit';

// GET /api/export/payments - Export all payments as CSV (manager + owner)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const payments = await db.payment.findMany({
      include: {
        member: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });

    // Build CSV
    const headers = ['Receipt#', 'Member', 'Amount', 'Method', 'Date (EC)', 'Voided'];
    const rows = payments.map((payment) => {
      const receiptNumber = payment.receiptNumber;
      const memberName = `${payment.member.firstName} ${payment.member.lastName}`;
      const amount = String(payment.amount);
      const method = payment.method;
      const dateEC = formatEthiopianDate(payment.paymentDate);
      const voided = payment.isVoided ? 'Yes' : 'No';

      // Escape CSV fields (handle commas and quotes)
      const escapeCsv = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      return [
        escapeCsv(receiptNumber),
        escapeCsv(memberName),
        escapeCsv(amount),
        escapeCsv(method),
        escapeCsv(dateEC),
        escapeCsv(voided),
      ].join(',');
    });

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
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to export payments', 500);
  }
}
