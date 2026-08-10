import { NextRequest } from 'next/server';
import { getDocs, countDocs, chunk } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { apiError } from '@/lib/api';
import { escapeCsv } from '@/lib/format';
import { exportDateRangeWhere } from '@/lib/date-range';
import { formatEthiopianDate } from '@/lib/ethiopian-calendar';
import { computeMemberStatus } from '@/lib/member-status';

// 10k rows keeps exports snappy and bounds member PII / memory in one pull.
const MAX_EXPORT_ROWS = 10_000;

// GET /api/export/members - Export members as CSV (owner only). Optional ?startDate=&endDate= (ISO or EC) filter on createdAt.
export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  // Inclusive range: start of the start day → end of the end day. Malformed
  // input returns a 400 instead of silently exporting nothing or everything.
  const { where, error } = exportDateRangeWhere('createdAt', startDate, endDate);
  if (error) return apiError(error, 400);
  where.unshift(['isDeleted', '==', false]);

  const total = await countDocs('members', where);
  if (total > MAX_EXPORT_ROWS) {
    return apiError(`Export too large — narrow the date range (max ${MAX_EXPORT_ROWS} rows)`, 400);
  }

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
