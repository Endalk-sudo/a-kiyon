import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { formatEthiopianDate, parseEthiopianDate } from '@/lib/ethiopian-calendar';

// GET /api/export/payments - Export payments as CSV (manager + owner)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    const where: Record<string, unknown> = {};

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) {
        const startParsed = parseEthiopianDate(startDate);
        if (startParsed.success && startParsed.date) {
          where.paymentDate.gte = startParsed.date;
        } else {
          where.paymentDate.gte = new Date(startDate);
        }
      }
      if (endDate) {
        const endParsed = parseEthiopianDate(endDate);
        if (endParsed.success && endParsed.date) {
          const end = endParsed.date;
          end.setHours(23, 59, 59, 999);
          where.paymentDate.lte = end;
        } else {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.paymentDate.lte = end;
        }
      }
    }

    const payments = await db.payment.findMany({
      where,
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
