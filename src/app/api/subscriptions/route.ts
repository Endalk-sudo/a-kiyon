import { db, getDocById, getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, paginatedResponse, apiError, parseIntParam } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createSubscriptionSchema } from '@/lib/schemas';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';
import { listSubscriptions } from '@/services/subscription.service';
import { generateReceiptNumber } from '@/services/payment.service';
import { NextRequest } from 'next/server';

// GET /api/subscriptions - List subscriptions with server-side pagination
export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(undefined, request);

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseIntParam(searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, parseIntParam(searchParams.get('limit'), 10)));
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
  }  let parsedStartDate: Date;
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
      if (!result.success || !result.date) return apiError(result.error || 'Invalid Ethiopian date format');
      paymentDateValue = result.date;
    } else {
      const d = new Date(paymentStr);
      if (!isNaN(d.getTime())) paymentDateValue = d;
    }
    if (paymentDateValue.getTime() > now + 60 * 60 * 1000) {
      return apiError('Payment date cannot be in the future');
    }
  }

  const receiptNumber = generateReceiptNumber();

  // The duplicate-active check runs INSIDE the transaction against a
  // member+service lock doc. Firestore transactions retry when the docs they
  // touched changed, so two concurrent POSTs for the same member+service
  // serialize: the loser re-checks on retry, sees the winner's active
  // subscription, and aborts with the conflict error.
  //
  // Member and service validity are ALSO re-verified inside the transaction:
  // the fast-fail reads above only exist for friendly errors — authority
  // rests with the tx snapshot so a member soft-deleted (or service
  // deactivated/repriced) moments before the commit can never be subscribed
  // against. Price and duration for the charge and end date come from the
  // in-transaction service read, never the pre-tx snapshot.
  const result = await db.runTransaction(async (tx) => {
    const memberSnap = await tx.get(db.collection('members').doc(data.memberId));
    if (!memberSnap.exists || memberSnap.data()?.isDeleted) {
      return { kind: 'member_missing' as const };
    }

    const serviceSnap = await tx.get(db.collection('services').doc(data.serviceId));
    if (!serviceSnap.exists) return { kind: 'service_missing' as const };
    const svcData = serviceSnap.data() as { price: number; duration: number; isActive: boolean };
    if (!svcData.isActive) return { kind: 'service_inactive' as const };

    const lockRef = db.collection('subscription-locks').doc(`${data.memberId}_${data.serviceId}`);
    await tx.get(lockRef);

    const activeCheck = await tx.get(
      db
        .collection('subscriptions')
        .where('memberId', '==', data.memberId)
        .where('serviceId', '==', data.serviceId)
        .where('status', '==', 'active')
        .limit(1),
    );
    if (!activeCheck.empty) return { kind: 'duplicate' as const };

    tx.set(lockRef, { updatedAt: new Date().toISOString() });

    const txEndDate = new Date(parsedStartDate);
    txEndDate.setDate(txEndDate.getDate() + svcData.duration);
    const txEndDateIso = txEndDate.toISOString();

    const subRef = db.collection('subscriptions').doc();
    tx.set(subRef, {
      memberId: data.memberId,
      serviceId: data.serviceId,
      startDate: parsedStartDate.toISOString(),
      endDate: txEndDateIso,
      status: 'active',
      priceSnapshot: svcData.price,
      notes: data.notes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const payRef = db.collection('payments').doc();
    tx.set(payRef, {
      subscriptionId: subRef.id,
      memberId: data.memberId,
      amount: svcData.price,
      paymentDate: paymentDateValue.toISOString(),
      method: data.paymentMethod,
      receiptNumber,
      createdBy: session.userId,
      isVoided: false,
      extendedTo: txEndDateIso,
      previousExtendedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      kind: 'ok' as const,
      subscriptionId: subRef.id,
      paymentId: payRef.id,
      endDate: txEndDateIso,
      price: svcData.price,
    };
  });

  switch (result.kind) {
    case 'member_missing':
      return apiError('Member not found', 404);
    case 'service_missing':
      return apiError('Service not found', 404);
    case 'service_inactive':
      return apiError('Service is not active');
    case 'duplicate':
      return apiError('Member already has an active subscription for this service');
  }

  const subscription = {
    id: result.subscriptionId,
    memberId: data.memberId,
    serviceId: data.serviceId,
    startDate: parsedStartDate.toISOString(),
    endDate: result.endDate,
    status: 'active',
    priceSnapshot: result.price,
    notes: data.notes || null,
    member: { id: member.id, firstName: member.firstName, lastName: member.lastName, photo: member.photo },
    service: { id: service.id, name: service.name, price: result.price },
  };

  const payment = {
    id: result.paymentId,
    subscriptionId: result.subscriptionId,
    memberId: data.memberId,
    amount: result.price,
    paymentDate: paymentDateValue.toISOString(),
    method: data.paymentMethod,
    receiptNumber,
    createdBy: session.userId,
  };

  return apiResponse({ subscription, payment }, 201);
});
