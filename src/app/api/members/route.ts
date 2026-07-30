import { db, getDocById, getDocs } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { paginatedResponse, apiResponse } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { createMemberSchema } from '@/lib/schemas';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';
import { listMembers, createMember } from '@/services/member.service';
import { autoExpireSubscriptions } from '@/services/subscription.service';
import { generateReceiptNumber } from '@/services/payment.service';
import { NextRequest } from 'next/server';

export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(undefined, request);

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const showDeleted = searchParams.get('showDeleted') === 'true';

  await autoExpireSubscriptions();

  const result = await listMembers({ page, limit, search, statusFilter, showDeleted });

  return paginatedResponse(result.data, result.pagination);
});

export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

  const body = await request.json();
  const data = createMemberSchema.parse(body);

  const ethiopianPattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?$/i;

  const member = await createMember(data);

  let subscription: Record<string, unknown> | null = null;
  let payment: Record<string, unknown> | null = null;

  if (data.serviceId) {
    const serviceSnap = await db.collection('services').doc(data.serviceId).get();
    if (!serviceSnap.exists) throw new Error('Service not found');
    const service = { id: serviceSnap.id, ...serviceSnap.data() } as { id: string; name: string; nameAm?: string; price: number; duration: number; isActive: boolean };
    if (!service.isActive) throw new Error('Service is not active');

    const existingActive = await getDocs('subscriptions', [
      ['memberId', '==', member.id],
      ['serviceId', '==', data.serviceId],
      ['status', '==', 'active'],
    ]);
    if (existingActive.length > 0) throw new Error('Member already has an active subscription for this service');

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + service.duration);

    let paymentDateValue = startDate;
    if (data.paymentDate) {
      const paymentStr = String(data.paymentDate).trim();
      if (ethiopianPattern.test(paymentStr)) {
        const parsed = parseEthiopianDate(paymentStr);
        if (parsed.success && parsed.date) paymentDateValue = parsed.date;
      } else {
        const d = new Date(paymentStr);
        if (!isNaN(d.getTime())) paymentDateValue = d;
      }
    }

    const receiptNumber = generateReceiptNumber();

    const { subscriptionId, paymentId } = await db.runTransaction(async (tx) => {
      const subRef = db.collection('subscriptions').doc();
      tx.set(subRef, {
        memberId: member.id,
        serviceId: data.serviceId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: 'active',
        priceSnapshot: service.price,
        notes: data.subscriptionNotes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const payRef = db.collection('payments').doc();
      tx.set(payRef, {
        subscriptionId: subRef.id,
        memberId: member.id,
        amount: service.price,
        paymentDate: paymentDateValue.toISOString(),
        method: data.paymentMethod!,
        receiptNumber,
        createdBy: session.userId,
        isVoided: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return { subscriptionId: subRef.id, paymentId: payRef.id };
    });

    subscription = {
      id: subscriptionId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: 'active',
      priceSnapshot: service.price,
      notes: data.subscriptionNotes || null,
      service: { id: service.id, name: service.name, nameAm: service.nameAm, price: service.price, duration: service.duration },
    };

    payment = {
      id: paymentId,
      amount: service.price,
      receiptNumber,
      method: data.paymentMethod!,
    };
  }

  await createAuditLog({
    userId: session.userId,
    action: 'member.create',
    details: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, hasSubscription: !!data.serviceId },
    entity: 'member',
    entityId: member.id,
  });

  const status = subscription ? 'active' : 'no_subscription';
  const responseData: Record<string, unknown> = { ...member, status };
  if (subscription) {
    responseData.subscription = subscription;
    if (payment) {
      responseData.payment = payment;
    }
  }

  return apiResponse(responseData, 201);
});
