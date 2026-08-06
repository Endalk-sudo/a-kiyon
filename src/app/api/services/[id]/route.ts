import { NextRequest } from 'next/server';
import { getDocById, updateDoc } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { updateServiceSchema } from '@/lib/schemas';

export const PUT = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner'], request);

  const { id } = await params;
  const body = await request.json();
  const data = updateServiceSchema.parse(body);

  const existing = await getDocById<{ isActive: boolean }>('services', id);
  if (!existing) return apiError('Service not found', 404);

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.nameAm !== undefined) updateData.nameAm = data.nameAm;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.descriptionAm !== undefined) updateData.descriptionAm = data.descriptionAm;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.duration !== undefined) updateData.duration = data.duration;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const service = await updateDoc<{
    name: string;
    nameAm: string | null;
    description: string | null;
    descriptionAm: string | null;
    price: number;
    duration: number;
    isActive: boolean;
  }>('services', id, updateData);

  return apiResponse(service);
});

export const DELETE = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await getSessionOrThrow(['owner'], request);

  const { id } = await params;

  const existing = await getDocById<{ isActive: boolean; name: string }>('services', id);
  if (!existing) return apiError('Service not found', 404);
  if (!existing.isActive) return apiError('Service is already inactive');

  await updateDoc<{ name: string; isActive: boolean }>('services', id, { isActive: false });

  return apiResponse({ message: 'Service deactivated successfully' });
});
