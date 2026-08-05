import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { paginatedResponse, apiResponse, apiError } from '@/lib/api';
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

  // No subscription requested — create the member on its own
  if (!data.serviceId) {
    const member = await createMember(data);
    return apiResponse({ ...member, status: 'no_subscription' }, 201);
  }

  const serviceSnap = await db.collection('services').doc(data.serviceId).get();
  if (!serviceSnap.exists) return apiError('Service not found', 404);
  const service = { id: serviceSnap.id, ...serviceSnap.data() } as { id: string; name: string; nameAm?: string; price: number; duration: number; isActive: boolean };
  if (!service.isActive) return apiError('Service is not active');

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
    if (paymentDateValue.getTime() > Date.now() + 60 * 60 * 1000) {
      return apiError('Payment date cannot be in the future');
    }
  }

  const receiptNumber = generateReceiptNumber();

  // Member + subscription + payment created atomically in one transaction
  const { memberId, subscriptionId, paymentId } = await db.runTransaction(async (tx) => {
    const memberRef = db.collection('members').doc();
    const now = new Date().toISOString();
    tx.set(memberRef, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      photo: data.photo || null,
      address: data.address || null,
      weight: data.weight ?? null,
      height: data.height ?? null,
      bloodType: data.bloodType || null,
      emergencyContact: data.emergencyContact || null,
      notes: data.notes || null,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const subRef = db.collection('subscriptions').doc();
    tx.set(subRef, {
      memberId: memberRef.id,
      serviceId: data.serviceId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: 'active',
      priceSnapshot: service.price,
      notes: data.subscriptionNotes || null,
      createdAt: now,
      updatedAt: now,
    });

    const payRef = db.collection('payments').doc();
    tx.set(payRef, {
      subscriptionId: subRef.id,
      memberId: memberRef.id,
      amount: service.price,
      paymentDate: paymentDateValue.toISOString(),
      method: data.paymentMethod!,
      receiptNumber,
      createdBy: session.userId,
      isVoided: false,
      extendedTo: endDate.toISOString(),
      previousExtendedTo: null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      memberId: memberRef.id,
      subscriptionId: subRef.id,
      paymentId: payRef.id,
    };
  });

  const member = {
    id: memberId,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone || null,
    photo: data.photo || null,
    address: data.address || null,
    weight: data.weight ?? null,
    height: data.height ?? null,
    bloodType: data.bloodType || null,
    emergencyContact: data.emergencyContact || null,
    notes: data.notes || null,
    isDeleted: false,
    deletedAt: null,
  };

  const subscription = {
    id: subscriptionId,
    memberId,
    serviceId: data.serviceId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    status: 'active',
    priceSnapshot: service.price,
    notes: data.subscriptionNotes || null,
    service: { id: service.id, name: service.name, nameAm: service.nameAm, price: service.price, duration: service.duration },
  };

  const payment = {
    id: paymentId,
    amount: service.price,
    receiptNumber,
    method: data.paymentMethod!,
  };

  return apiResponse({ ...member, status: 'active', subscription, payment }, 201);
});
