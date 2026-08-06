import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { batchUpdate, chunk } from '@/lib/db';

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

// POST /api/members/bulk-soft-delete - Soft-delete many members in chunked
// batches (owner + manager). Used by the Storage data-hygiene flow instead of
// N parallel DELETE requests.
export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const body = await request.json();
  const { ids } = bodySchema.parse(body);

  const now = new Date().toISOString();
  let deleted = 0;
  for (const idChunk of chunk(ids)) {
    deleted += await batchUpdate('members', [['__name__', 'in', idChunk]], {
      isDeleted: true,
      deletedAt: now,
    });
  }

  return apiResponse({ message: `Soft-deleted ${deleted} member(s)`, deleted });
});
