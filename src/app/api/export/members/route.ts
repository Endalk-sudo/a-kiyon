import { NextRequest } from 'next/server';
import { getDocs, chunk, type WhereClause } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { escapeCsv } from '@/lib/format';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';
import { computeMemberStatus } from '@/lib/member-status';

// GET /api/export/members - Export members as CSV (manager + owner). Optional ?startDate=&endDate= (ISO) filter on createdAt.
export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner', 'manager'], request);

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const where: WhereClause[] = [['isDeleted', '==', false]];
  if (startDate) where.push(['createdAt', '>=', startDate]);
  if (endDate) where.push(['createdAt', '<=', endDate]);

  const members = await getDocs<{
    firstName: string;
    lastName: string;
    phone: string | null;
    createdAt: string;
  }>('members', where, ['createdAt', 'desc']);

  type SubRow = { memberId: string; status: string; endDate: string };
  const allSubs: SubRow[] = [];
  for (const idChunk of chunk(members.map((m) => m.id))) {
    allSubs.push(...(await getDocs<SubRow>('subscriptions', [['memberId', 'in', idChunk]], ['createdAt', 'desc'])));
  }
  const subsByMember = new Map<string, SubRow[]>();
  for (const sub of allSubs) {
    const list = subsByMember.get(sub.memberId) || [];
    list.push(sub);
    subsByMember.set(sub.memberId, list);
  }

  const rows = members.map((member) => {
    const subs = subsByMember.get(member.id) || [];
    const memberStatus = computeMemberStatus(subs);
    const createdAt = new Date(member.createdAt);
    const createdDateEC = Number.isNaN(createdAt.getTime()) ? '' : formatEthiopianDate(createdAt);
    const name = `${member.firstName} ${member.lastName}`;
    const phone = member.phone || '';

    return [
      escapeCsv(name),
      escapeCsv(phone),
      escapeCsv(memberStatus),
      escapeCsv(createdDateEC),
    ].join(',');
  });

  const headers = ['Name', 'Phone', 'Status', 'Created Date (EC)'];
  const csvContent = [headers.join(','), ...rows].join('\n');

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="members_export.csv"',
    },
  });
});
