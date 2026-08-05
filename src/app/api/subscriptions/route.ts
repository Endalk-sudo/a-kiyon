import { db, getDocById, getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, paginatedResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createSubscriptionSchema } from '@/lib/schemas';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';
import { listSubscriptions } from '@/services/subscription.service';
import { generateReceiptNumber } from '@/services/payment.service';
import { NextRequest } from 'next/server';

// GET /api/subscriptions - List subscriptions with server-side pagination
export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(undefined, request);
  if (!['owner', 'manager'].includes(session.role)) throw new Error('Forbidden');

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const memberId = searchParams.get('memberId') || undefined;
  const serviceId = searchParams.get('serviceId') || undefined;
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || '';

  const result = await listSubscriptions({ page, limit, memberId, serviceId, status, search });

  return paginatedResponse(result.data, result.pagination);
});

// POST /api/subscriptions - Create subscription with payment (manager + owner)
export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);
  const body = await request.json();
  const data = createSubscriptionSchema.parse(body);

  const startDate = data.startDate || new Date().toISOString();

  const member = await getDocById<{ firstName: string; lastName: string; photo: string | null; isDeleted: boolean }>('members', data.memberId);
  if (!member || member.isDeleted) return apiError('Member not found', 404);

  const service = await getDocById<{ name: string; price: number; duration: number; isActive: boolean }>('services', data.serviceId);
  if (!service) return apiError('Service not found', 404);
  if (!service.isActive) return apiError('Service is not active');

  const existingActive = await getDocs('subscriptions', [
    ['memberId', '==', data.memberId],
    ['serviceId', '==', data.serviceId],
    ['status', '==', 'active'],
  ]);
  if (existingActive.length > 0) {
    return apiError('Member already has an active subscription for this service');
  }

  let parsedStartDate: Date;
  const dateStr = String(startDate).trim();
  const ethiopianPattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?$/i;
  if (ethiopianPattern.test(dateStr)) {
    const result = parseEthiopianDate(dateStr);
    if (!result.success || !result.date) return apiError(result.error || 'Invalid Ethiopian date format');
    parsedStartDate = result.date;
  } else {
    parsedStartDate = new Date(dateStr);
    if (isNaN(parsedStartDate.getTime())) return apiError('Invalid start date format');
  }

  const now = Date.now();
  if (parsedStartDate.getTime() > now + 60 * 60 * 1000) {
    return apiError('Start date cannot be in the future');
  }

  let paymentDateValue = parsedStartDate;
  if (data.paymentDate) {
    const paymentStr = String(data.paymentDate).trim();
    if (ethiopianPattern.test(paymentStr)) {
      const result = parseEthiopianDate(paymentStr);
      if (result.success && result.date) paymentDateValue = result.date;
    } else {
      const d = new Date(paymentStr);
      if (!isNaN(d.getTime())) paymentDateValue = d;
    }
    if (paymentDateValue.getTime() > now + 60 * 60 * 1000) {
      return apiError('Payment date cannot be in the future');
    }
  }

  const parsedEndDate = new Date(parsedStartDate);
  parsedEndDate.setDate(parsedEndDate.getDate() + service.duration);

  const receiptNumber = generateReceiptNumber();

  const { subscriptionId, paymentId } = await db.runTransaction(async (tx) => {
    const subRef = db.collection('subscriptions').doc();
    tx.set(subRef, {
      memberId: data.memberId,
      serviceId: data.serviceId,
      startDate: parsedStartDate.toISOString(),
      endDate: parsedEndDate.toISOString(),
      status: 'active',
      priceSnapshot: service.price,
      notes: data.notes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const payRef = db.collection('payments').doc();
    tx.set(payRef, {
      subscriptionId: subRef.id,
      memberId: data.memberId,
      amount: service.price,
      paymentDate: paymentDateValue.toISOString(),
      method: data.paymentMethod,
      receiptNumber,
      createdBy: session.userId,
      isVoided: false,
      extendedTo: parsedEndDate.toISOString(),
      previousExtendedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { subscriptionId: subRef.id, paymentId: payRef.id };
  });

  const subscription = {
    id: subscriptionId,
    memberId: data.memberId,
    serviceId: data.serviceId,
    startDate: parsedStartDate.toISOString(),
    endDate: parsedEndDate.toISOString(),
    status: 'active',
    priceSnapshot: service.price,
    notes: data.notes || null,
    member: { id: member.id, firstName: member.firstName, lastName: member.lastName, photo: member.photo },
    service: { id: service.id, name: service.name, price: service.price },
  };

  const payment = {
    id: paymentId,
    subscriptionId,
    memberId: data.memberId,
    amount: service.price,
    paymentDate: paymentDateValue.toISOString(),
    method: data.paymentMethod,
    receiptNumber,
    createdBy: session.userId,
  };

  return apiResponse({ subscription, payment }, 201);
});
