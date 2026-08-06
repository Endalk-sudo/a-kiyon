import { NextRequest } from 'next/server';
import { countDocs, getDocs, getDocsByIds, aggregateSum } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { autoExpireSubscriptions } from '@/services/subscription.service';

export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(undefined, request);

  await autoExpireSubscriptions();

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalMembers = await countDocs('members', [['isDeleted', '==', false]]);
  const activeSubscriptions = await countDocs('subscriptions', [['status', '==', 'active']]);
  const expiringSoonCount = await countDocs('subscriptions', [
    ['status', '==', 'active'],
    ['endDate', '<=', sevenDaysFromNow.toISOString()],
    ['endDate', '>=', now.toISOString()],
  ]);
  const expiredCount = await countDocs('subscriptions', [['status', '==', 'expired']]);
  const totalRevenue = (await aggregateSum('payments', 'amount', [['isVoided', '==', false]])) || 0;
  const revenueThisMonth = (await aggregateSum('payments', 'amount', [
    ['isVoided', '==', false],
    ['paymentDate', '>=', startOfMonth.toISOString()],
  ])) || 0;

  const expiringSoonSubscriptions = await getDocs<any>('subscriptions', [
    ['status', '==', 'active'],
    ['endDate', '<=', sevenDaysFromNow.toISOString()],
    ['endDate', '>=', now.toISOString()],
  ], ['endDate', 'asc'], 20);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentlyExpiredSubscriptions = await getDocs<any>('subscriptions', [
    ['status', '==', 'expired'],
    ['endDate', '>=', thirtyDaysAgo.toISOString()],
  ], ['endDate', 'desc'], 10);

  const recentPaymentsData = await getDocs<any>('payments', [
    ['isVoided', '==', false],
  ], ['paymentDate', 'desc'], 10);

  const memberIds = [
    ...new Set([
      ...expiringSoonSubscriptions.map((s) => s.memberId),
      ...recentlyExpiredSubscriptions.map((s) => s.memberId),
      ...recentPaymentsData.map((p) => p.memberId),
    ]),
  ];
  const serviceIds = [
    ...new Set(expiringSoonSubscriptions.map((s) => s.serviceId)),
  ];

  const [memberDocs, serviceDocs] = await Promise.all([
    getDocsByIds<{ firstName: string; lastName: string; photo: string | null; photoThumb?: string | null }>(
      'members',
      memberIds,
    ),
    getDocsByIds<{ name: string; nameAm: string | null }>('services', serviceIds),
  ]);

  const membersMap = new Map(memberDocs.map((m) => [m.id, m]));
  const servicesMap = new Map(serviceDocs.map((s) => [s.id, s]));

  const expiringSoonMembers = expiringSoonSubscriptions.map((sub) => {
    const member = membersMap.get(sub.memberId);
    const service = servicesMap.get(sub.serviceId);
    return {
      memberId: sub.memberId,
      firstName: member?.firstName || '',
      lastName: member?.lastName || '',
      photo: member?.photo || null,
      photoThumb: member?.photoThumb || null,
      subscriptionId: sub.id,
      serviceName: service?.name || '',
      serviceNameAm: service?.nameAm || '',
      endDate: sub.endDate,
      priceSnapshot: sub.priceSnapshot,
    };
  });

  const recentlyExpiredMembers = recentlyExpiredSubscriptions.map((sub) => {
    const member = membersMap.get(sub.memberId);
    return {
      memberId: sub.memberId,
      firstName: member?.firstName || '',
      lastName: member?.lastName || '',
      photo: member?.photo || null,
      photoThumb: member?.photoThumb || null,
      subscriptionId: sub.id,
      endDate: sub.endDate,
    };
  });

  const recentPayments = recentPaymentsData.map((payment) => {
    const member = membersMap.get(payment.memberId);
    return {
      id: payment.id,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      method: payment.method,
      receiptNumber: payment.receiptNumber,
      memberName: member ? `${member.firstName} ${member.lastName}` : '',
      memberId: payment.memberId,
    };
  });

  const monthStarts: Date[] = [];
  for (let i = 5; i >= 0; i--) {
    monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  const monthRevenues = await Promise.all(
    monthStarts.map(async (monthStart) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
      const revenue = (await aggregateSum('payments', 'amount', [
        ['isVoided', '==', false],
        ['paymentDate', '>=', monthStart.toISOString()],
        ['paymentDate', '<=', monthEnd.toISOString()],
      ])) || 0;

      return {
        month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue,
      };
    }),
  );

  const monthlyRevenue = monthRevenues;

  return apiResponse({
    totalMembers,
    activeSubscriptions,
    expiringSoonCount,
    expiredCount,
    totalRevenue,
    revenueThisMonth,
    expiringSoonMembers,
    recentlyExpiredMembers,
    recentPayments,
    monthlyRevenue,
  });
});
