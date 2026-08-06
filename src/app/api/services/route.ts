import { NextRequest } from 'next/server';
import { getDocs, countDocs, createDoc } from '@/lib/db';
import type { WhereClause } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, parseIntParam } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createServiceSchema } from '@/lib/schemas';

export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(undefined, request);

  const { searchParams } = request.nextUrl;
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const page = parseIntParam(searchParams.get('page'), 0);
  const limit = parseIntParam(searchParams.get('limit'), 0);

  const where: WhereClause[] = includeInactive ? [] : [['isActive', '==', true]];

  if (page && limit) {
    const [services, total] = await Promise.all([
      getDocs<{
        name: string;
        nameAm: string | null;
        description: string | null;
        descriptionAm: string | null;
        price: number;
        duration: number;
        isActive: boolean;
      }>('services', where.length ? where : undefined, ['name', 'asc'], limit, (page - 1) * limit),
      countDocs('services', where.length ? where : undefined),
    ]);
    return apiResponse({ data: services, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  }

  const services = await getDocs<{
    name: string;
    nameAm: string | null;
    description: string | null;
    descriptionAm: string | null;
    price: number;
    duration: number;
    isActive: boolean;
  }>('services', where.length ? where : undefined, ['name', 'asc']);

  return apiResponse({ data: services });
});

export const POST = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);
  const body = await request.json();
  const data = createServiceSchema.parse(body);

  const service = await createDoc<{
    name: string;
    nameAm: string | null;
    description: string | null;
    descriptionAm: string | null;
    price: number;
    duration: number;
    isActive: boolean;
  }>('services', {
    name: data.name,
    nameAm: data.nameAm || null,
    description: data.description || null,
    descriptionAm: data.descriptionAm || null,
    price: data.price,
    duration: data.duration,
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  return apiResponse(service, 201);
});
