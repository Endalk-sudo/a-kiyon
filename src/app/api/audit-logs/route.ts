import { NextRequest } from 'next/server';
import { getDocs, countDocs } from '@/lib/db';
import type { WhereClause } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { paginatedResponse } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';

// GET /api/audit-logs - List audit logs (owner only)
export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner'], request);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const entity = searchParams.get('entity');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const skip = (page - 1) * limit;

  const whereClauses: WhereClause[] = [];

  if (userId) {
    whereClauses.push(['userId', '==', userId]);
  }

  if (action) {
    whereClauses.push(['action', '==', action]);
  }

  if (entity) {
    whereClauses.push(['entity', '==', entity]);
  }

  if (startDate) {
    const startParsed = parseEthiopianDate(startDate);
    const date = startParsed.success && startParsed.date ? startParsed.date : new Date(startDate);
    whereClauses.push(['createdAt', '>=', date.toISOString()]);
  }

  if (endDate) {
    const endParsed = parseEthiopianDate(endDate);
    const rawDate = endParsed.success && endParsed.date ? endParsed.date : new Date(endDate);
    rawDate.setHours(23, 59, 59, 999);
    whereClauses.push(['createdAt', '<=', rawDate.toISOString()]);
  }

  const whereForQuery = whereClauses.length > 0 ? whereClauses : undefined;

  const [logs, total] = await Promise.all([
    getDocs('auditLogs', whereForQuery, ['createdAt', 'desc'], limit, skip),
    countDocs('auditLogs', whereForQuery),
  ]);

  const totalPages = Math.ceil(total / limit);

  return paginatedResponse(logs, {
    total,
    page,
    limit,
    totalPages,
  });
});
