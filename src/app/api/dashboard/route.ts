import { db } from '@/lib/db';
import { getSession, getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError, unauthorizedError } from '@/lib/api';

export async function GET() {
  try {
    const session = await getSessionOrThrow();

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total non-deleted members
    const totalMembers = await db.member.count({
      where: { isDeleted: false },
    });

    // Active subscriptions
    const activeSubscriptions = await db.subscription.count({
      where: { status: 'active' },
    });

    // Expiring soon (within 7 days)
    const expiringSoonCount = await db.subscription.count({
      where: {
        status: 'active',
        endDate: { lte: sevenDaysFromNow, gte: now },
      },
    });

    // Expired subscriptions
    const expiredCount = await db.subscription.count({
      where: { status: 'expired' },
    });

    // Total revenue (sum of non-voided payments)
    const totalRevenueResult = await db.payment.aggregate({
      _sum: { amount: true },
      where: { isVoided: false },
    });
    const totalRevenue = totalRevenueResult._sum.amount || 0;

    // Revenue this month
    const revenueThisMonthResult = await db.payment.aggregate({
      _sum: { amount: true },
      where: {
        isVoided: false,
        paymentDate: { gte: startOfMonth },
      },
    });
    const revenueThisMonth = revenueThisMonthResult._sum.amount || 0;

    // Expiring soon members (with details)
    const expiringSoonSubscriptions = await db.subscription.findMany({
      where: {
        status: 'active',
        endDate: { lte: sevenDaysFromNow, gte: now },
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            nameAm: true,
          },
        },
      },
      orderBy: { endDate: 'asc' },
    });

    const expiringSoonMembers = expiringSoonSubscriptions.map((sub) => ({
      memberId: sub.member.id,
      firstName: sub.member.firstName,
      lastName: sub.member.lastName,
      photo: sub.member.photo,
      subscriptionId: sub.id,
      serviceName: sub.service.name,
      serviceNameAm: sub.service.nameAm,
      endDate: sub.endDate,
      priceSnapshot: sub.priceSnapshot,
    }));

    // Recently expired members
    const recentlyExpiredSubscriptions = await db.subscription.findMany({
      where: {
        status: 'expired',
        endDate: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
      orderBy: { endDate: 'desc' },
      take: 10,
    });

    const recentlyExpiredMembers = recentlyExpiredSubscriptions.map((sub) => ({
      memberId: sub.member.id,
      firstName: sub.member.firstName,
      lastName: sub.member.lastName,
      photo: sub.member.photo,
      subscriptionId: sub.id,
      endDate: sub.endDate,
    }));

    // Recent payments (last 10)
    const recentPayments = await db.payment.findMany({
      where: { isVoided: false },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: 10,
    });

    const recentPaymentsFormatted = recentPayments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      method: payment.method,
      receiptNumber: payment.receiptNumber,
      memberName: `${payment.member.firstName} ${payment.member.lastName}`,
      memberId: payment.memberId,
    }));

    // Monthly revenue (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const monthResult = await db.payment.aggregate({
        _sum: { amount: true },
        where: {
          isVoided: false,
          paymentDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      });

      monthlyRevenue.push({
        month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue: monthResult._sum.amount || 0,
      });
    }

    return apiResponse({
      totalMembers,
      activeSubscriptions,
      expiringSoonCount,
      expiredCount,
      totalRevenue,
      revenueThisMonth,
      expiringSoonMembers,
      recentlyExpiredMembers,
      recentPayments: recentPaymentsFormatted,
      monthlyRevenue,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return unauthorizedError();
    }
    console.error('Dashboard error:', error);
    return apiError('An error occurred while fetching dashboard data', 500);
  }
}
