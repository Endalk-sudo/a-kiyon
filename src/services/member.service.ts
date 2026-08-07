import { getDocById, getDocs, getDocsByIds, countDocs, createDoc, updateDoc, chunk, type Doc, type WhereClause } from '@/lib/db';
import { computeMemberStatus, findNearestEndDate } from '@/lib/member-status';
import { calculateNavyBodyFatPercent, type Sex } from '@/lib/body-fat';

export type MemberListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  statusFilter?: string;
  showDeleted?: boolean;
};

interface MemberData {
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
  photoThumb?: string | null;
  address: string | null;
  weight: number | null;
  height: number | null;
  bloodType: string | null;
  sex: Sex | null;
  neck: number | null;
  waist: number | null;
  hip: number | null;
  bodyFatPercent: number | null;
  emergencyContact: string | null;
  notes: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionSummary {
  id: string;
  memberId: string;
  endDate: string;
  status: string;
  serviceId: string;
}

export async function listMembers(options: MemberListOptions = {}) {
  const { page = 1, limit = 20, search = '', statusFilter = '', showDeleted = false } = options;

  const where: WhereClause[] = [];
  if (!showDeleted) {
    where.push(['isDeleted', '==', false]);
  }

  // Fast path — no search/status filter: Firestore-paginated query
  if (!search && !statusFilter) {
    const [members, total] = await Promise.all([
      getDocs<MemberData>('members', where, ['createdAt', 'desc'], limit, (page - 1) * limit),
      countDocs('members', where),
    ]);

    const withSubs = await attachSubscriptionStatuses(members);
    return {
      data: withSubs,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Filtered path — fetch all candidates, compute statuses, then filter + paginate in memory
  const members = await getDocs<MemberData>('members', where, ['createdAt', 'desc']);
  const withSubs = await attachSubscriptionStatuses(members);

  let filtered = withSubs;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)),
    );
  }

  if (statusFilter) {
    filtered = filtered.filter((m) => m.status === statusFilter);
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  return {
    data: filtered.slice(start, start + limit),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function attachSubscriptionStatuses(members: Doc<MemberData>[]) {
  const memberIds = members.map((m) => m.id);
  const allSubs: SubscriptionSummary[] = [];
  for (const idChunk of chunk(memberIds)) {
    allSubs.push(
      ...(await getDocs<SubscriptionSummary>('subscriptions', [['memberId', 'in', idChunk]])),
    );
  }

  const subsByMember = new Map<string, SubscriptionSummary[]>();
  for (const sub of allSubs) {
    const list = subsByMember.get(sub.memberId) || [];
    list.push(sub);
    subsByMember.set(sub.memberId, list);
  }

  return members.map((member) => {
    const subs = subsByMember.get(member.id) || [];
    const status = computeMemberStatus(subs);
    const subscriptionEndDate = findNearestEndDate(subs);
    return { ...member, status, subscriptionEndDate };
  });
}

export async function getMember(id: string) {
  const member = await getDocById<MemberData>('members', id);
  if (!member) return null;

  const subs = await getDocs<SubscriptionSummary>('subscriptions', [['memberId', '==', member.id]], ['createdAt', 'desc']);

  const subsServiceIds = [...new Set(subs.map((sub) => sub.serviceId))];
  const subsServiceDocs = await getDocsByIds<{ name: string; nameAm: string | null; price: number }>('services', subsServiceIds);
  const servicesMap = new Map(subsServiceDocs.map((s) => [s.id, s]));

  // All the member's payments in one query — grouped per subscription for the
  // response instead of running one payments query per subscription (N+1).
  const payments = await getDocs<{ subscriptionId: string | null; memberId: string; paymentDate: string }>('payments', [['memberId', '==', member.id]], ['paymentDate', 'desc']);

  const subsWithService = subs.map((sub) => {
    const service = servicesMap.get(sub.serviceId);
    return {
      ...sub,
      service: service ? { id: service.id, name: service.name, nameAm: service.nameAm, price: service.price } : null,
      payments: payments.filter((p) => p.subscriptionId === sub.id),
    };
  });

  const paymentSubIds = [...new Set(payments.map((p) => p.subscriptionId).filter((id): id is string => Boolean(id)))];
  const paymentSubs = await getDocsByIds<{ serviceId: string }>('subscriptions', paymentSubIds);
  const paymentSubsMap = new Map(paymentSubs.map((s) => [s.id, s]));

  const paymentServiceIds = [...new Set(paymentSubs.map((s) => s.serviceId).filter(Boolean))];
  const paymentServiceDocs = await getDocsByIds<{ name: string }>('services', paymentServiceIds);
  const paymentServicesMap = new Map(paymentServiceDocs.map((s) => [s.id, s]));

  const paymentsWithService = payments.map((p) => {
    const sub = p.subscriptionId ? paymentSubsMap.get(p.subscriptionId) : null;
    const service = sub?.serviceId ? paymentServicesMap.get(sub.serviceId) : null;
    return {
      ...p,
      subscription: sub ? { service: service ? { name: service.name } : null } : null,
    };
  });

  const status = computeMemberStatus(subs);
  return { ...member, subscriptions: subsWithService, payments: paymentsWithService, status };
}

export async function createMember(data: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  photo?: string | null;
  photoThumb?: string | null;
  address?: string | null;
  weight?: number | null;
  height?: number | null;
  bloodType?: string | null;
  sex?: Sex | null;
  neck?: number | null;
  waist?: number | null;
  hip?: number | null;
  emergencyContact?: string | null;
  notes?: string | null;
}) {
  const bodyFatPercent = computeBodyFatPercent(data);
  return createDoc<MemberData>('members', {
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone || null,
    photo: data.photo || null,
    photoThumb: data.photoThumb || null,
    address: data.address || null,
    weight: data.weight ?? null,
    height: data.height ?? null,
    bloodType: data.bloodType || null,
    sex: data.sex || null,
    neck: data.neck ?? null,
    waist: data.waist ?? null,
    hip: data.hip ?? null,
    bodyFatPercent,
    emergencyContact: data.emergencyContact || null,
    notes: data.notes || null,
    isDeleted: false,
    deletedAt: null,
  });
}

/**
 * Derive the stored body-fat percentage from measurements (or null when the
 * data is incomplete). Used by create/update paths so the persisted value
 * always reflects the current measurements.
 */
export function computeBodyFatPercent(data: {
  sex?: Sex | null;
  height?: number | null;
  neck?: number | null;
  waist?: number | null;
  hip?: number | null;
}): number | null {
  return calculateNavyBodyFatPercent({
    sex: data.sex ?? null,
    heightCm: data.height ?? null,
    neckCm: data.neck ?? null,
    waistCm: data.waist ?? null,
    hipCm: data.hip ?? null,
  });
}

export async function updateMember(id: string, data: Record<string, unknown>) {
  return updateDoc<MemberData>('members', id, data);
}

export async function softDeleteMember(id: string) {
  return updateDoc<MemberData>('members', id, {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
  });
}

export async function restoreMember(id: string) {
  return updateDoc<MemberData>('members', id, {
    isDeleted: false,
    deletedAt: null,
  });
}
