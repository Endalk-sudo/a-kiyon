import {
  getDocById, getDocs, getDocsByIds, countDocs, updateDoc, batchUpdate, chunk,
} from '@/lib/db';
import type { WhereClause, Doc } from '@/lib/db';
import { resolveMemberPhoto } from '@/services/storage.service';

interface SubscriptionDoc {
  memberId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  status: string;
  priceSnapshot: number;
  notes?: string | null;
}

// Expiry is normally enforced on every read (documented design). Debounce the
// actual scan+write so a page with many API calls (or many concurrent users)
// doesn't trigger the full scan + batch update once per request — the status
// just becomes slightly less "live" between ticks.
const EXPIRE_DEBOUNCE_MS = 60_000;
let lastExpireRun = 0;

/** Test hook — clears the debounce window so the next call runs immediately. */
export function resetAutoExpireDebounce() {
  lastExpireRun = 0;
}

export async function autoExpireSubscriptions() {
  const now = Date.now();
  if (now - lastExpireRun < EXPIRE_DEBOUNCE_MS) return;
  lastExpireRun = now;

  await batchUpdate('subscriptions', [
    ['status', '==', 'active'],
    ['endDate', '<', new Date(now).toISOString()],
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

  // Search path — name match against non-deleted members, then filter + paginate in memory
  if (search) {
    const allMembers = await getDocs<{ firstName: string; lastName: string; isDeleted?: boolean }>('members');
    const term = search.toLowerCase();
    const matchingIds = allMembers
      .filter((m) => !m.isDeleted)
      .filter(m => m.firstName.toLowerCase().includes(term) || m.lastName.toLowerCase().includes(term))
      .map(m => m.id);

    if (matchingIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const allSubs: Doc<SubscriptionDoc>[] = [];
    for (const idChunk of chunk(matchingIds)) {
      allSubs.push(
        ...(await getDocs<SubscriptionDoc>('subscriptions', [['memberId', 'in', idChunk]], ['createdAt', 'desc'])),
      );
    }

    let filtered = allSubs;
    if (memberId) filtered = filtered.filter((s) => s.memberId === memberId);
    if (serviceId) filtered = filtered.filter((s) => s.serviceId === serviceId);
    if (status) filtered = filtered.filter((s) => s.status === status);

    const total = filtered.length;
    const pageData = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);
    const data = await enrichSubscriptions(pageData);

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  const where: WhereClause[] = [];

  if (memberId) where.push(['memberId', '==', memberId]);
  if (serviceId) where.push(['serviceId', '==', serviceId]);
  if (status) where.push(['status', '==', status]);

  const [subscriptions, total] = await Promise.all([
    getDocs<SubscriptionDoc>('subscriptions', where, ['createdAt', 'desc'], limit, (page - 1) * limit),
    countDocs('subscriptions', where),
  ]);

  const data = await enrichSubscriptions(subscriptions);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function enrichSubscriptions(subscriptions: Doc<SubscriptionDoc>[]) {
  const memberIds = [...new Set(subscriptions.map((sub) => sub.memberId))];
  const serviceIds = [...new Set(subscriptions.map((sub) => sub.serviceId))];

  const [memberDocs, serviceDocs] = await Promise.all([
    getDocsByIds<{ firstName: string; lastName: string; photo: string | null; photoThumb?: string | null }>(
      'members',
      memberIds,
    ),
    getDocsByIds<{ name: string; nameAm: string | null; price: number; duration: number }>('services', serviceIds),
  ]);

  const membersMap = new Map(memberDocs.map((m) => [m.id, m]));
  const servicesMap = new Map(serviceDocs.map((s) => [s.id, s]));

  const photoUrls = new Map<string, Awaited<ReturnType<typeof resolveMemberPhoto>>>();
  await Promise.all(
    memberDocs.map(async (m) => {
      photoUrls.set(m.id, await resolveMemberPhoto(m.photo, m.photoThumb));
    }),
  );

  return Promise.all(subscriptions.map(async (sub) => {
    const member = membersMap.get(sub.memberId);
    const photos = member ? photoUrls.get(member.id) : undefined;
    return {
      ...sub,
      member: member
        ? {
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            photo: photos?.photo ?? null,
            photoThumb: photos?.photoThumb ?? null,
          }
        : { id: sub.memberId, firstName: '', lastName: '', photo: null },
      service: servicesMap.get(sub.serviceId) || { id: sub.serviceId, name: '', nameAm: null, price: 0, duration: 0 },
    };
  }));
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
    getDocById<{ firstName: string; lastName: string; photo: string | null; photoThumb?: string | null; phone: string | null }>(
      'members',
      sub.memberId,
    ),
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

  const memberPhotos = await resolveMemberPhoto(member?.photo, member?.photoThumb);

  return {
    ...sub,
    member: member
      ? {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          photo: memberPhotos.photo,
          photoThumb: memberPhotos.photoThumb,
          phone: member.phone,
        }
      : { id: sub.memberId, firstName: '', lastName: '', photo: null, phone: null },
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
