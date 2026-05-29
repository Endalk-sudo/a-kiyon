import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';
import { createAuditLog } from '@/lib/audit';

// GET /api/export/members - Export all members as CSV (manager + owner)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    // Build where clause
    const where: Record<string, unknown> = {
      isDeleted: false,
    };

    const members = await db.member.findMany({
      where,
      include: {
        subscriptions: {
          select: {
            status: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build CSV
    const headers = ['Name', 'Phone', 'Email', 'Status', 'Created Date (EC)'];
    const rows = members.map((member) => {
      const memberStatus = member.subscriptions.length > 0
        ? member.subscriptions[0].status
        : 'no subscription';
      const createdDateEC = formatEthiopianDate(member.createdAt);
      const name = `${member.firstName} ${member.lastName}`;
      const phone = member.phone || '';
      const email = member.email || '';

      // Escape CSV fields (handle commas and quotes)
      const escapeCsv = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      return [escapeCsv(name), escapeCsv(phone), escapeCsv(email), escapeCsv(memberStatus), escapeCsv(createdDateEC)].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    await createAuditLog({
      userId: session.userId,
      action: 'export.members',
      details: { count: members.length },
      entity: 'member',
    });

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="members_export.csv"',
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedError();
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return forbiddenError();
    }
    return apiError('Failed to export members', 500);
  }
}
