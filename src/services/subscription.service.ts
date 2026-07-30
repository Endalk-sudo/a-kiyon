import {
  getDocById, getDocs, countDocs, updateDoc, batchUpdate,
} from '@/lib/db';
import type { WhereClause } from '@/lib/db';

export async function autoExpireSubscriptions() {
  const now = new Date();
  await batchUpdate('subscriptions', [
    ['status', '==', 'active'],
    ['endDate', '<', now.toISOString()],
  ], { status: 'expired' });
}

export type SubscriptionListOptions = {
  page?: number;
  limit?: number;
  memberId?: string;
  serviceId?: string;
  status?: string;
  search?: string;
};

export async function listSubscriptions(options: SubscriptionListOptions = {}) {
  const { page = 1, limit = 10, memberId, serviceId, status, search } = options;

  await autoExpireSubscriptions();

  const where: WhereClause[] = [];

  if (memberId) where.push(['memberId', '==', memberId]);
  if (serviceId) where.push(['serviceId', '==', serviceId]);
  if (status) where.push(['status', '==', status]);

  if (search) {
    const allMembers = await getDocs<{ firstName: string; lastName: string }>('members');
    const term = search.toLowerCase();
    const matchingIds = allMembers
      .filter(m => m.firstName.toLowerCase().includes(term) || m.lastName.toLowerCase().includes(term))
      .map(m => m.id);
    if (matchingIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }
    where.push(['memberId', 'in', matchingIds.slice(0, 10)]);
  }

  const [subscriptions, total] = await Promise.all([
    getDocs<{
      memberId: string;
      serviceId: string;
      startDate: string;
      endDate: string;
      status: string;
      priceSnapshot: number;
      notes?: string | null;
    }>('subscriptions', where, ['createdAt', 'desc'], limit, (page - 1) * limit),
    countDocs('subscriptions', where),
  ]);

  const data = await Promise.all(
    subscriptions.map(async (sub) => {
      const [member, service] = await Promise.all([
        getDocById<{ firstName: string; lastName: string; photo: string | null }>('members', sub.memberId),
        getDocById<{ name: string; nameAm: string | null; price: number; duration: number }>('services', sub.serviceId),
      ]);
      return {
        ...sub,
        member: member || { id: sub.memberId, firstName: '', lastName: '', photo: null },
        service: service || { id: sub.serviceId, name: '', nameAm: null, price: 0, duration: 0 },
      };
    }),
  );

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSubscription(id: string) {
  const sub = await getDocById<{
    memberId: string;
    serviceId: string;
    startDate: string;
    endDate: string;
    status: string;
    priceSnapshot: number;
    notes?: string | null;
  }>('subscriptions', id);
  if (!sub) return null;

  const [member, service] = await Promise.all([
    getDocById<{ firstName: string; lastName: string; photo: string | null; phone: string | null }>('members', sub.memberId),
    getDocById<{ name: string; nameAm: string | null; price: number; duration: number }>('services', sub.serviceId),
  ]);

  const payments = await getDocs<{
    subscriptionId: string;
    amount: number;
    paymentDate: string;
    method: string;
    receiptNumber: string;
    isVoided: boolean;
    voidedAt: string | null;
    voidedBy: string | null;
    notes: string | null;
    memberId: string;
  }>('payments', [
    ['subscriptionId', '==', id],
    ['isVoided', '==', false],
  ], ['paymentDate', 'desc']);

  return {
    ...sub,
    member: member || { id: sub.memberId, firstName: '', lastName: '', photo: null, phone: null },
    service: service || { id: sub.serviceId, name: '', nameAm: null, price: 0, duration: 0 },
    payments,
  };
}

export async function updateSubscription(id: string, data: { status?: string; notes?: string | null }) {
  const updateData: Record<string, unknown> = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const sub = await updateDoc<{
    memberId: string;
    serviceId: string;
    startDate: string;
    endDate: string;
    status: string;
    priceSnapshot: number;
    notes?: string | null;
  }>('subscriptions', id, updateData);
  if (!sub) return null;

  const [member, service] = await Promise.all([
    getDocById<{ firstName: string; lastName: string; photo: string | null }>('members', sub.memberId),
    getDocById<{ name: string; price: number }>('services', sub.serviceId),
  ]);

  return {
    ...sub,
    member: member || { id: sub.memberId, firstName: '', lastName: '', photo: null },
    service: service || { id: sub.serviceId, name: '', price: 0 },
  };
}
