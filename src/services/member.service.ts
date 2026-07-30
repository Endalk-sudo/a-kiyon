import { db, getDocById, getDocs, countDocs, createDoc, updateDoc, deleteDoc, batchUpdate, type Doc, type WhereClause } from '@/lib/db';
import { computeMemberStatus, findNearestEndDate } from '@/lib/member-status';

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
  address: string | null;
  weight: number | null;
  height: number | null;
  bloodType: string | null;
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

interface MemberWithSubs extends MemberData {
  subscriptions?: SubscriptionSummary[];
}

export async function listMembers(options: MemberListOptions = {}) {
  const { page = 1, limit = 20, search = '', statusFilter = '', showDeleted = false } = options;

  const where: WhereClause[] = [];
  if (!showDeleted) {
    where.push(['isDeleted', '==', false]);
  }

  const [members, total] = await Promise.all([
    getDocs<MemberData>('members', where, ['createdAt', 'desc'], limit, (page - 1) * limit),
    countDocs('members', where),
  ]);

  const memberIds = members.map((m) => m.id);
  const allSubs = memberIds.length > 0
    ? await getDocs<SubscriptionSummary>('subscriptions', [['memberId', 'in', memberIds]])
    : [];
  const subsByMember = new Map<string, SubscriptionSummary[]>();
  for (const sub of allSubs) {
    const list = subsByMember.get(sub.memberId) || [];
    list.push(sub);
    subsByMember.set(sub.memberId, list);
  }

  const withSubs = members.map((member) => {
    const subs = subsByMember.get(member.id) || [];
    const status = computeMemberStatus(subs);
    const subscriptionEndDate = findNearestEndDate(subs);
    return { ...member, status, subscriptionEndDate };
  });

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

  return {
    data: filtered,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getMember(id: string) {
  const member = await getDocById<MemberData>('members', id);
  if (!member) return null;

  const subs = await getDocs<any>('subscriptions', [['memberId', '==', member.id]], ['createdAt', 'desc']);
  const subsWithService = await Promise.all(
    subs.map(async (sub) => {
      const service = await getDocById<any>('services', sub.serviceId);
      const payments = await getDocs<any>('payments', [['subscriptionId', '==', sub.id], ['isVoided', '==', false]], ['paymentDate', 'desc']);
      return { ...sub, service: service ? { id: service.id, name: service.name, nameAm: service.nameAm, price: service.price } : null, payments };
    }),
  );

  const payments = await getDocs<any>('payments', [['memberId', '==', member.id]], ['paymentDate', 'desc']);
  const paymentsWithService = await Promise.all(
    payments.map(async (p) => {
      const sub = p.subscriptionId ? await getDocById<any>('subscriptions', p.subscriptionId) : null;
      return { ...p, subscription: sub ? { service: sub.serviceId ? await getDocById<any>('services', sub.serviceId).then(s => s ? { name: s.name } : null) : null } : null };
    }),
  );

  const status = computeMemberStatus(subs);
  return { ...member, subscriptions: subsWithService, payments: paymentsWithService, status };
}

export async function createMember(data: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  photo?: string | null;
  address?: string | null;
  weight?: number | null;
  height?: number | null;
  bloodType?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
}) {
  return createDoc<MemberData>('members', {
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
