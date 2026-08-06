import { db, getDocById, getDocs, getDocsByIds, countDocs, updateDoc } from '@/lib/db';
import type { Doc, WhereClause } from '@/lib/db';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';

export function generateReceiptNumber(): string {
  return `RCPT-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function parseDateString(dateStr: string): Date | null {
  const ethiopianPattern = /^\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?$/i;
  if (ethiopianPattern.test(dateStr)) {
    const result = parseEthiopianDate(dateStr);
    if (result.success && result.date) return result.date;
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export type RecordAndExtendResult =
  | {
      ok: true;
      payment: {
        id: string;
        subscriptionId: string;
        memberId: string;
        amount: number;
        paymentDate: string;
        method: string;
        receiptNumber: string;
        notes: string | null;
        createdBy: string;
        isVoided: boolean;
        extendedTo: string;
        previousExtendedTo: string;
      };
      subscription: {
        id: string;
        memberId: string;
        serviceId: string;
        startDate: string;
        endDate: string;
        status: string;
        priceSnapshot: number;
        service: { id: string; name: string; price: number; duration: number };
      };
    }
  | { ok: false; reason: 'subscription_not_found' | 'member_not_found' | 'subscription_inactive' | 'service_not_found' | 'service_inactive' | 'amount_mismatch' };

/**
 * Record a payment and extend the subscription end date in one transaction.
 *
 * This is the single rule for "money in = days added". Used by both
 * POST /api/subscriptions/[id]/renew and POST /api/payments.
 *
 * @param allowReactivation - When true, `expired` and `cancelled` subscriptions
 *   may be reactivated: the end date restarts from today (or the current end
 *   date if it is still in the future). Payments on inactive subscriptions are
 *   rejected unless this is set.
 */
export async function recordAndExtendPayment(data: {
  subscriptionId: string;
  amount?: number;
  method: string;
  notes?: string | null;
  createdBy: string;
  allowReactivation?: boolean;
}): Promise<RecordAndExtendResult> {
  const existing = await getDocById<{
    memberId: string;
    serviceId: string;
    startDate: string;
    priceSnapshot: number;
  }>('subscriptions', data.subscriptionId);

  if (!existing) return { ok: false, reason: 'subscription_not_found' };

  const member = await getDocById<{ isDeleted: boolean }>('members', existing.memberId);
  if (!member || member.isDeleted) return { ok: false, reason: 'member_not_found' };

  const service = await getDocById<{ name: string; price: number; duration: number; isActive: boolean }>(
    'services',
    existing.serviceId,
  );
  if (!service) return { ok: false, reason: 'service_not_found' };
  if (!service.isActive) return { ok: false, reason: 'service_inactive' };
  if (data.amount !== undefined && data.amount !== service.price) return { ok: false, reason: 'amount_mismatch' };

  const amount = data.amount ?? service.price;
  const now = new Date();
  const receiptNumber = generateReceiptNumber();

  // The subscription is read INSIDE the transaction so concurrent renewals
  // each extend from the latest committed end date. Without this, two
  // simultaneous payments on the same subscription would both compute the
  // same new end date and the second would take money but add zero days.
  const result = await db.runTransaction(async (tx) => {
    const subRef = db.collection('subscriptions').doc(data.subscriptionId);
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists) return { error: 'subscription_not_found' as const };

    const sub = subSnap.data() as {
      memberId: string;
      serviceId: string;
      startDate: string;
      endDate: string;
      status: string;
      priceSnapshot: number;
    };
    if (sub.status !== 'active' && !data.allowReactivation) {
      return { error: 'subscription_inactive' as const };
    }

    const currentEndDate = new Date(sub.endDate);
    const startDate = currentEndDate > now ? currentEndDate : now;
    const newEndDate = new Date(startDate);
    newEndDate.setDate(newEndDate.getDate() + service.duration);
    const newEndDateIso = newEndDate.toISOString();

    tx.update(subRef, {
      endDate: newEndDateIso,
      status: 'active',
      updatedAt: now.toISOString(),
    });

    const payRef = db.collection('payments').doc();
    tx.set(payRef, {
      subscriptionId: data.subscriptionId,
      memberId: sub.memberId,
      amount,
      paymentDate: now.toISOString(),
      method: data.method,
      receiptNumber,
      notes: data.notes || null,
      createdBy: data.createdBy,
      isVoided: false,
      extendedTo: newEndDateIso,
      previousExtendedTo: sub.endDate,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    return {
      error: null as null,
      paymentId: payRef.id,
      newEndDateIso,
      sub,
    };
  });

  if (result.error) {
    return { ok: false, reason: result.error };
  }

  const { paymentId, newEndDateIso, sub } = result;

  return {
    ok: true,
    payment: {
      id: paymentId,
      subscriptionId: data.subscriptionId,
      memberId: sub.memberId,
      amount,
      paymentDate: now.toISOString(),
      method: data.method,
      receiptNumber,
      notes: data.notes || null,
      createdBy: data.createdBy,
      isVoided: false,
      extendedTo: newEndDateIso,
      previousExtendedTo: sub.endDate,
    },
    subscription: {
      id: data.subscriptionId,
      memberId: sub.memberId,
      serviceId: sub.serviceId,
      startDate: sub.startDate,
      endDate: newEndDateIso,
      status: 'active',
      priceSnapshot: sub.priceSnapshot,
      service: { id: service.id, name: service.name, price: service.price, duration: service.duration },
    },
  };
}

/**
 * Void a payment and roll the subscription back to the previous payment's
 * `extendedTo` — atomically.
 *
 * Payments with rollback metadata go through a Firestore transaction so the
 * "marked voided" + "subscription rolled back" pair can never be half-applied,
 * and a concurrent double-void is rejected. Payments without metadata
 * (pre-migration rows) fall back to best-effort reconstruction.
 */
export async function voidPayment(id: string, voidedBy: string) {
  const target = await getDocById<{
    isVoided?: boolean;
    extendedTo?: string | null;
  }>('payments', id);

  if (!target || target.isVoided) return null;

  // Legacy payment without rollback metadata — best-effort reconstruction.
  if (!target.extendedTo) {
    return voidLegacyPayment(id, voidedBy);
  }

  const result = await db.runTransaction(async (tx) => {
    const payRef = db.collection('payments').doc(id);
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists || paySnap.data()?.isVoided) return null;

    const payment = paySnap.data() as {
      subscriptionId: string;
      memberId: string;
      amount: number;
      paymentDate: string;
      method: string;
      receiptNumber: string;
      notes: string | null;
      createdBy: string;
      extendedTo: string;
      previousExtendedTo?: string | null;
    };

    // All reads must precede the first write — do them up front.
    const subRef = db.collection('subscriptions').doc(payment.subscriptionId);
    const subSnap = await tx.get(subRef);
    const subscription = subSnap.exists
      ? ({
          id: subSnap.id,
          ...subSnap.data(),
        } as {
          id: string;
          startDate: string;
          endDate: string;
          priceSnapshot: number;
          serviceId: string;
          status: string;
        })
      : null;

    const serviceSnap = subscription
      ? await tx.get(db.collection('services').doc(subscription.serviceId))
      : null;
    const serviceName = serviceSnap?.exists ? (serviceSnap.data() as { name: string }).name : undefined;

    // Latest non-voided payment on this subscription (excluding the one being
    // voided). Its extendedTo is the correct rollback target — never
    // `payment.previousExtendedTo` by itself, which can point to a payment
    // that was itself voided earlier (validity backed by refunded money).
    const remainingPayments = (
      await tx.get(
        db
          .collection('payments')
          .where('subscriptionId', '==', payment.subscriptionId)
          .where('isVoided', '==', false)
          .orderBy('createdAt', 'desc'),
      )
    ).docs
      .map((d) => ({ id: d.id, ...d.data() }) as { id: string; extendedTo?: string | null })
      .filter((p) => p.id !== id);

    const now = new Date();
    const voidedAt = now.toISOString();

    tx.update(payRef, {
      isVoided: true,
      voidedAt,
      voidedBy,
    });

    if (subscription) {
      let rolledBackEndDate: Date | null = remainingPayments[0]?.extendedTo
        ? new Date(remainingPayments[0].extendedTo)
        : null;

      // The remaining payment lacks rollback metadata (legacy row) — fall back
      // to the voided payment's own previous state.
      if (!rolledBackEndDate && payment.previousExtendedTo) {
        rolledBackEndDate = new Date(payment.previousExtendedTo);
      }

      // Reconstruct from the start date when no metadata exists at all
      // (mirrors the legacy-void reconstruction).
      if (
        remainingPayments.length > 0 &&
        (!rolledBackEndDate || isNaN(rolledBackEndDate.getTime()))
      ) {
        if (serviceSnap?.exists && subscription.startDate) {
          const base = new Date(subscription.startDate);
          if (!isNaN(base.getTime())) {
            rolledBackEndDate = new Date(base);
            rolledBackEndDate.setDate(
              rolledBackEndDate.getDate() +
                (serviceSnap.data() as { duration: number }).duration * remainingPayments.length,
            );
          }
        }
      }

      const rolledBackValid = rolledBackEndDate !== null && !isNaN(rolledBackEndDate.getTime());

      if (rolledBackValid && rolledBackEndDate) {
        const status =
          subscription.status === 'cancelled'
            ? 'cancelled'
            : rolledBackEndDate >= now
              ? 'active'
              : 'expired';

        tx.update(subRef, {
          endDate: rolledBackEndDate.toISOString(),
          status,
          hasVoidedPayment: true,
          voidedPaymentNote: `End date rolled back — payment ${payment.receiptNumber} voided`,
        });
      } else if (remainingPayments.length > 0) {
        // Payments remain but no rollback target could be derived — flag only.
        tx.update(subRef, {
          hasVoidedPayment: true,
        });
      } else {
        // No non-voided payments remain — no validity remains.
        if (subscription.status === 'active') {
          tx.update(subRef, {
            status: 'cancelled',
            hasVoidedPayment: true,
            voidedPaymentNote: `Cancelled — sole payment ${payment.receiptNumber} voided`,
          });
        } else {
          tx.update(subRef, {
            hasVoidedPayment: true,
          });
        }
      }
    }

    return {
      payment: { ...payment, id, isVoided: true, voidedAt, voidedBy },
      subscription,
      serviceName,
    };
  });

  if (!result) return null;

  // Re-read the subscription after commit so the response reflects the
  // post-void state instead of the pre-void transaction read.
  const freshSub = result.subscription
    ? await getDocById<{
        startDate: string;
        endDate: string;
        priceSnapshot: number;
        serviceId: string;
        status: string;
      }>('subscriptions', result.subscription.id)
    : null;

  const member = await getDocById<{ firstName: string; lastName: string; photo: string | null }>(
    'members',
    result.payment.memberId,
  );

  return {
    ...result.payment,
    member: member || { id: result.payment.memberId, firstName: '', lastName: '', photo: null },
    subscription: freshSub
      ? {
          id: freshSub.id,
          startDate: freshSub.startDate,
          endDate: freshSub.endDate,
          status: freshSub.status,
          priceSnapshot: freshSub.priceSnapshot,
          service: { name: result.serviceName || '' },
        }
      : {
          id: result.payment.subscriptionId,
          startDate: '',
          endDate: '',
          status: '',
          priceSnapshot: 0,
          service: { name: '' },
        },
  };
}

/**
 * Legacy fallback for payments created before rollback metadata existed.
 * Reconstructs the previous validity from the remaining non-voided payments.
 * Best-effort — kept non-transactional because the reconstruction needs a
 * query, and this path predates the transactional query support in
 * `voidPayment` (which runs the same query inside the transaction).
 */
async function voidLegacyPayment(id: string, voidedBy: string) {
  const payment = await updateDoc<{
    subscriptionId: string;
    memberId: string;
    amount: number;
    paymentDate: string;
    method: string;
    receiptNumber: string;
    isVoided: boolean;
    voidedAt: string;
    voidedBy: string;
    notes: string | null;
    createdBy: string;
  }>('payments', id, {
    isVoided: true,
    voidedAt: new Date().toISOString(),
    voidedBy,
  });

  if (!payment) return null;

  const [member, subscription] = await Promise.all([
    getDocById<{ firstName: string; lastName: string; photo: string | null }>('members', payment.memberId),
    getDocById<{ startDate: string; endDate: string; priceSnapshot: number; serviceId: string; status: string }>(
      'subscriptions',
      payment.subscriptionId,
    ),
  ]);

  let serviceName: string | undefined;
  let updatedSubscription = subscription;

  if (subscription) {
    const service = await getDocById<{ name: string; duration: number }>('services', subscription.serviceId);
    serviceName = service?.name;

    const now = new Date();

    const otherPayments = (await getDocs<{
      extendedTo?: string | null;
      receiptNumber: string;
    }>('payments', [
      ['subscriptionId', '==', payment.subscriptionId],
      ['isVoided', '==', false],
    ], ['createdAt', 'desc'])).filter((p) => p.id !== id);

    if (otherPayments.length === 0) {
      if (subscription.status === 'active') {
        await updateDoc('subscriptions', payment.subscriptionId, {
          status: 'cancelled',
          hasVoidedPayment: true,
          voidedPaymentNote: `Cancelled — sole payment ${payment.receiptNumber} voided`,
        });
      } else {
        await updateDoc('subscriptions', payment.subscriptionId, {
          hasVoidedPayment: true,
        });
      }
    } else {
      const mostRecent = otherPayments[0];
      let rolledBackEndDate: Date | null = mostRecent.extendedTo
        ? new Date(mostRecent.extendedTo)
        : null;

      // Reconstruct from the start date when no metadata exists at all.
      if (!rolledBackEndDate || isNaN(rolledBackEndDate.getTime())) {
        if (service && subscription.startDate) {
          const base = new Date(subscription.startDate);
          if (!isNaN(base.getTime())) {
            rolledBackEndDate = new Date(base);
            rolledBackEndDate.setDate(rolledBackEndDate.getDate() + service.duration * otherPayments.length);
          }
        }
      }

      const status = rolledBackEndDate && rolledBackEndDate >= now ? 'active' : 'expired';

      await updateDoc('subscriptions', payment.subscriptionId, {
        ...(rolledBackEndDate ? { endDate: rolledBackEndDate.toISOString() } : {}),
        status,
        hasVoidedPayment: true,
        voidedPaymentNote: `End date rolled back — payment ${payment.receiptNumber} voided`,
      });
    }

    // Re-read after the rollback so the response reflects the post-void state.
    updatedSubscription = await getDocById<{
      startDate: string;
      endDate: string;
      priceSnapshot: number;
      serviceId: string;
      status: string;
    }>('subscriptions', payment.subscriptionId);
  }

  return {
    ...payment,
    member: member || { id: payment.memberId, firstName: '', lastName: '', photo: null },
    subscription: updatedSubscription
      ? {
          id: updatedSubscription.id,
          startDate: updatedSubscription.startDate,
          endDate: updatedSubscription.endDate,
          status: updatedSubscription.status,
          priceSnapshot: updatedSubscription.priceSnapshot,
          service: { name: serviceName || '' },
        }
      : { id: payment.subscriptionId, startDate: '', endDate: '', status: '', priceSnapshot: 0, service: { name: '' } },
  };
}

export type PaymentListOptions = {
  page?: number;
  limit?: number;
  memberId?: string;
  method?: string;
  isVoided?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
};

export async function listPayments(options: PaymentListOptions = {}) {
  const { page = 1, limit = 20, memberId, method, isVoided, startDate, endDate, search } = options;

  const where: WhereClause[] = [];
  if (memberId) where.push(['memberId', '==', memberId]);
  if (method) where.push(['method', '==', method]);
  if (isVoided !== undefined) where.push(['isVoided', '==', isVoided]);

  if (startDate) {
    const parsed = parseDateString(startDate);
    if (parsed) where.push(['paymentDate', '>=', parsed.toISOString()]);
  }
  if (endDate) {
    const parsed = parseDateString(endDate);
    if (parsed) {
      const end = new Date(parsed);
      end.setHours(23, 59, 59, 999);
      where.push(['paymentDate', '<=', end.toISOString()]);
    }
  }

  // Search path — matches receipt number or member name; filter + paginate in
  // memory so the result is consistent across pages (client-side filtering of
  // one page is broken once pagination kicks in).
  if (search) {
    const term = search.toLowerCase();
    const allMembers = await getDocs<{ firstName: string; lastName: string }>('members');
    const matchingMemberIds = new Set(
      allMembers
        .filter((m) => m.firstName.toLowerCase().includes(term) || m.lastName.toLowerCase().includes(term))
        .map((m) => m.id),
    );

    const allPayments = await getDocs<PaymentDoc>('payments', where, ['paymentDate', 'desc']);
    const filtered = allPayments.filter(
      (p) =>
        p.receiptNumber.toLowerCase().includes(term) ||
        matchingMemberIds.has(p.memberId),
    );

    const total = filtered.length;
    const pageData = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    return {
      data: await enrichPayments(pageData),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  const [payments, total] = await Promise.all([
    getDocs<PaymentDoc>('payments', where, ['paymentDate', 'desc'], limit, (page - 1) * limit),
    countDocs('payments', where),
  ]);

  return {
    data: await enrichPayments(payments),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

type PaymentDoc = {
  subscriptionId: string;
  memberId: string;
  amount: number;
  paymentDate: string;
  method: string;
  receiptNumber: string;
  isVoided: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
  notes: string | null;
  createdBy: string;
};

async function enrichPayments(payments: Doc<PaymentDoc>[]) {
  const memberIds = [...new Set(payments.map((p) => p.memberId))];
  const subscriptionIds = [...new Set(payments.map((p) => p.subscriptionId))];
  const [memberDocs, subscriptionDocs] = await Promise.all([
    getDocsByIds<{ firstName: string; lastName: string; photo: string | null; photoThumb?: string | null }>(
      'members',
      memberIds,
    ),
    getDocsByIds<{ startDate: string; endDate: string; status: string; priceSnapshot: number; serviceId: string }>(
      'subscriptions',
      subscriptionIds,
    ),
  ]);

  const serviceIds = [...new Set(subscriptionDocs.map((s) => s.serviceId))];
  const serviceDocs = await getDocsByIds<{ name: string }>('services', serviceIds);

  const membersMap = new Map(memberDocs.map((m) => [m.id, m]));
  const subscriptionsMap = new Map(subscriptionDocs.map((s) => [s.id, s]));
  const servicesMap = new Map(serviceDocs.map((s) => [s.id, s]));

  return payments.map((p) => {
    const member = membersMap.get(p.memberId);
    const subscription = subscriptionsMap.get(p.subscriptionId);
    const serviceName = subscription ? servicesMap.get(subscription.serviceId)?.name : undefined;

    return {
      ...p,
      member: member || { id: p.memberId, firstName: '', lastName: '', photo: null },
      subscription: subscription
        ? {
            id: subscription.id,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            status: subscription.status,
            priceSnapshot: subscription.priceSnapshot,
            service: { name: serviceName || '' },
          }
        : {
            id: p.subscriptionId,
            startDate: '',
            endDate: '',
            status: '',
            priceSnapshot: 0,
            service: { name: '' },
          },
    };
  });
}
