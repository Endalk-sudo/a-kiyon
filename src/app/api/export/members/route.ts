import { NextRequest } from 'next/server';
import { getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';
import { createAuditLog } from '@/lib/audit';

// GET /api/export/members - Export all members as CSV (manager + owner)
export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const members = await getDocs<any>('members', [['isDeleted', '==', false]], ['createdAt', 'desc']);

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const rows = await Promise.all(members.map(async (member) => {
    const subscriptions = await getDocs<any>('subscriptions', [
      ['memberId', '==', member.id],
    ], ['createdAt', 'desc'], 1);

    const memberStatus = subscriptions.length > 0 ? subscriptions[0].status : 'no subscription';
    const createdDateEC = formatEthiopianDate(member.createdAt);
    const name = `${member.firstName} ${member.lastName}`;
    const phone = member.phone || '';

    return [
      escapeCsv(name),
      escapeCsv(phone),
      escapeCsv(memberStatus),
      escapeCsv(createdDateEC),
    ].join(',');
  }));

  const headers = ['Name', 'Phone', 'Status', 'Created Date (EC)'];
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
});
