import { db } from '@/lib/db';
import { getSessionOrThrow } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { paginatedResponse, apiResponse, apiError, unauthorizedError, forbiddenError } from '@/lib/api';
import { NextRequest } from 'next/server';

type MemberStatus = 'active' | 'expiring_soon' | 'expired' | 'no_subscription';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionOrThrow();
    if (!session) return unauthorizedError();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || '';
    const showDeleted = searchParams.get('showDeleted') === 'true';

    // Auto-expire subscriptions past their end date
    await db.subscription.updateMany({
      where: { status: 'active', endDate: { lt: new Date() } },
      data: { status: 'expired' },
    });

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (!showDeleted) {
      where.isDeleted = false;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [members, total] = await Promise.all([
      db.member.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: {
            select: { id: true, endDate: true, status: true, serviceId: true },
          },
        },
      }),
      db.member.count({ where }),
    ]);

    // Compute status and subscriptionEndDate for each member
    const membersWithStatus = members.map((member) => {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const subs = member.subscriptions;
      let status: MemberStatus = 'no_subscription';
      let subscriptionEndDate: Date | null = null;

      if (subs.length > 0) {
        const activeSubs = subs.filter((s) => s.status !== 'cancelled');
        const hasActive = activeSubs.some((s) => s.endDate >= now);
        const hasExpiringSoon = activeSubs.some(
          (s) => s.endDate >= now && s.endDate <= sevenDaysFromNow
        );
        const allExpired = activeSubs.length === 0 || activeSubs.every((s) => s.endDate < now);

        if (hasExpiringSoon) status = 'expiring_soon';
        else if (hasActive) status = 'active';
        else if (allExpired) status = 'expired';

        // Find the nearest end date among non-cancelled subscriptions
        const nearest = activeSubs
          .filter((s) => s.endDate >= now)
          .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())[0];
        if (nearest) {
          subscriptionEndDate = nearest.endDate;
        }
      }

      const { subscriptions: _subscriptions, ...memberData } = member;
      return { ...memberData, status, subscriptionEndDate };
    });

    // Filter by status if requested
    let filtered = membersWithStatus;
    if (statusFilter) {
      filtered = membersWithStatus.filter((m) => m.status === statusFilter);
    }

    const totalPages = Math.ceil(total / limit);

    return paginatedResponse(filtered, { total, page, limit, totalPages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const body = await request.json();
    const {
      firstName, lastName, phone, photo,
      address, weight, height, bloodType,
      emergencyContact, notes,
      serviceId, paymentMethod, paymentDate: rawPaymentDate, subscriptionNotes,
    } = body;

    if (!firstName || !lastName) {
      return apiError('First name and last name are required');
    }

    // If subscribing, validate fields
    if (serviceId) {
      if (!paymentMethod) {
        return apiError('paymentMethod is required when creating a subscription');
      }
      const validMethods = ['cash', 'bank_transfer', 'mobile_money'];
      if (!validMethods.includes(paymentMethod)) {
        return apiError(`Invalid payment method. Must be one of: ${validMethods.join(', ')}`);
      }
    }

    const { member, subscription, payment } = await db.$transaction(async (tx) => {
      const m = await tx.member.create({
        data: {
          firstName,
          lastName,
          phone: phone || null,
          photo: photo || null,
          address: address || null,
          weight: weight ? parseFloat(String(weight)) : null,
          height: height ? parseFloat(String(height)) : null,
          bloodType: bloodType || null,
          emergencyContact: emergencyContact || null,
          notes: notes || null,
        },
      });

      if (serviceId) {
        const service = await tx.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new Error('Service not found');
        if (!service.isActive) throw new Error('Service is not active');

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + service.duration);

        let paymentDateValue = startDate;
        if (rawPaymentDate) {
          const ethiopianPattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?$/i;
          const paymentStr = String(rawPaymentDate).trim();
          if (ethiopianPattern.test(paymentStr)) {
            const { parseEthiopianDate } = await import('@/lib/ethiopian-calendar');
            const parsed = parseEthiopianDate(paymentStr);
            if (parsed.success && parsed.date) {
              paymentDateValue = parsed.date;
            }
          } else {
            const d = new Date(paymentStr);
            if (!isNaN(d.getTime())) paymentDateValue = d;
          }
        }

        const receiptNumber = `RCPT-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

        const sub = await tx.subscription.create({
          data: {
            memberId: m.id,
            serviceId,
            startDate,
            endDate,
            status: 'active',
            priceSnapshot: service.price,
            notes: subscriptionNotes || null,
          },
          include: {
            service: { select: { id: true, name: true, nameAm: true, price: true, duration: true } },
          },
        });

        const pay = await tx.payment.create({
          data: {
            subscriptionId: sub.id,
            memberId: m.id,
            amount: service.price,
            paymentDate: paymentDateValue,
            method: paymentMethod,
            receiptNumber,
            createdBy: session.userId,
          },
        });

        return { member: m, subscription: sub, payment: pay };
      }

      return { member: m, subscription: null as never, payment: null as never };
    });

    await createAuditLog({
      userId: session.userId,
      action: 'member.create',
      details: { firstName, lastName, phone, hasSubscription: !!serviceId },
      entity: 'member',
      entityId: member.id,
    });

    const status: MemberStatus = subscription ? 'active' : 'no_subscription';

    const responseData: Record<string, unknown> = { ...member, status };
    if (subscription) {
      responseData.subscription = {
        id: subscription.id,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status,
        priceSnapshot: subscription.priceSnapshot,
        service: subscription.service,
      };
      if (payment) {
        responseData.payment = {
          id: payment.id,
          amount: payment.amount,
          receiptNumber: payment.receiptNumber,
          method: payment.method,
        };
      }
    }

    return apiResponse(responseData, 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    if (message === 'Forbidden') return forbiddenError();
    return apiError(message, 500);
  }
}
