import { db, getDocById, getDocs, getDocsByIds, countDocs } from '@/lib/db';
import type { Doc, WhereClause } from '@/lib/db';
import { parseEthiopianDate } from '@/lib/ethiopian-calendar';
import { resolveMemberPhoto } from '@/services/storage.service';
import { deriveSubscriptionStatus } from '@/lib/member-status';

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

export type PaymentForRecompute = {
  id?: string;
  createdAt?: string | null;
  paymentDate?: string | null;
  previousExtendedTo?: string | null;
  extendedTo?: string | null;
};

/**
 * Recompute a subscription's end date from its remaining non-voided payments.
 *
 * The first remaining payment anchors validity at its own `extendedTo` (the
 * state it established), and every later payment re-applies the money-in math
 * of `recordAndExtendPayment`: `end = max(end, paymentDate) + duration`. This
 * means voiding a payment claws back its days from every later payment that
 * extended from it — unless a later payment was recorded after the clawed-back
 * validity had lapsed, in which case its days honestly restart from its own
 * payment date.
 *
 * `fallbackAnchor` (the voided payment's `previousExtendedTo`) covers legacy
 * rows whose first remaining payment has no rollback metadata.
 *
 * Used as the single rollback rule by `voidPayment` and `voidLegacyPayment`.
 */
export function recomputeEndDate(
  payments: PaymentForRecompute[],
  startDate: string | null | undefined,
  duration: number | null | undefined,
  fallbackAnchor?: string | null,
): Date | null {
  if (payments.length === 0) return null;
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime()) || !Number.isFinite(duration) || (duration ?? 0) <= 0) return null;

  const chronological = [...payments].sort((a, b) => {
    const byCreated = (a.createdAt || '').localeCompare(b.createdAt || '');
    if (byCreated !== 0) return byCreated;
    // Same-millisecond rows (e.g. a fast renewal chain) need a stable tiebreak
    // so the rollback anchor is deterministic.
    return (a.id || '').localeCompare(b.id || '');
  });

  const first = chronological[0];
  const anchor = first.extendedTo ? new Date(first.extendedTo) : null;
  const fallback = fallbackAnchor ? new Date(fallbackAnchor) : null;
  let end: Date;
  if (anchor && !isNaN(anchor.getTime())) {
    end = anchor;
  } else if (fallback && !isNaN(fallback.getTime())) {
    end = fallback;
  } else {
    end = new Date(start);
  }
  if (end.getTime() < start.getTime()) end = new Date(start);

  for (const p of chronological.slice(1)) {
    const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
    if (paymentDate && !isNaN(paymentDate.getTime()) && paymentDate.getTime() > end.getTime()) {
      end.setTime(paymentDate.getTime());
    }
    end.setDate(end.getDate() + (duration as number));
  }
  return end;
}

export type RecordAndExtendResult =
  | {
      ok: true;
      /** True when the request was a duplicate of an earlier payment (same idempotency key). */
      duplicate: boolean;
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
 * A client-supplied `idempotencyKey` makes the call safe to retry: the lock
 * is created in the SAME transaction as the payment, so a double-click or a
 * retry after a lost response returns the original payment instead of
 * charging twice.
 *
 * @param allowReactivation - When true, `expired` and `cancelled` subscriptions
 *   may be reactivated: the end date restarts from today (or the current end
 *   date if it is still in the future). Payments on inactive subscriptions are
 *   rejected unless this is set. Inactive here is derived from the end date and
 *   the manual `cancelled` state — a stale stored `expired` (lazily reconciled
 *   by the debounced auto-expire) that still has a future end date is treated
 *   as active, so a just-renewed subscription can never be locked out.
 */
export async function recordAndExtendPayment(data: {
  subscriptionId: string;
  amount?: number;
  method: string;
  notes?: string | null;
  createdBy: string;
  allowReactivation?: boolean;
  idempotencyKey?: string;
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

    // Idempotency: the lock lives in the same transaction as the payment, so
    // a retried request can never create a second charge.
    if (data.idempotencyKey) {
      const lockRef = db.collection('payment-locks').doc(data.idempotencyKey);
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return {
          error: null as null,
          duplicate: true as const,
          existingPaymentId: (lockSnap.data() as { paymentId?: string })?.paymentId ?? null,
        };
      }
    }

    // Validity gate is DERIVED: non-cancelled with a future end date counts as
    // active even when the stored status is stale ("expired" written by an
    // auto-expire batch that raced a renewal commit).
    const derivedActive = deriveSubscriptionStatus(sub) === 'active';
    if (!derivedActive && !data.allowReactivation) {
      return { error: 'subscription_inactive' as const };
    }

    // All validity checks are re-read INSIDE the transaction: a member
    // soft-deleted (or service deactivated/repriced) after the fast-fail
    // reads above must not receive a payment.
    const memberSnap = await tx.get(db.collection('members').doc(sub.memberId));
    if (!memberSnap.exists || memberSnap.data()?.isDeleted) {
      return { error: 'member_not_found' as const };
    }

    const serviceSnap = await tx.get(db.collection('services').doc(sub.serviceId));
    if (!serviceSnap.exists) return { error: 'service_not_found' as const };
    const svc = serviceSnap.data() as { price: number; isActive: boolean; duration: number };
    if (!svc.isActive) return { error: 'service_inactive' as const };
    if (data.amount !== undefined && data.amount !== svc.price) {
      return { error: 'amount_mismatch' as const };
    }
    const amount = data.amount ?? svc.price;

    const currentEndDate = new Date(sub.endDate);
    const startDate = currentEndDate > now ? currentEndDate : now;
    const newEndDate = new Date(startDate);
    // Duration is read from the transaction snapshot too — a service edit
    // between the fast-fail read above and this write must not apply stale
    // day counts to a freshly-priced charge.
    newEndDate.setDate(newEndDate.getDate() + svc.duration);
    const newEndDateIso = newEndDate.toISOString();

    tx.update(subRef, {
      endDate: newEndDateIso,
      status: 'active',
      hasVoidedPayment: false,
      voidedPaymentNote: null,
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
      idempotencyKey: data.idempotencyKey || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    if (data.idempotencyKey) {
      tx.set(db.collection('payment-locks').doc(data.idempotencyKey), {
        paymentId: payRef.id,
        subscriptionId: data.subscriptionId,
        createdAt: now.toISOString(),
      });
    }

    return {
      error: null as null,
      duplicate: false as const,
      paymentId: payRef.id,
      newEndDateIso,
      sub,
      amount,
    };
  });

  if (result.error) {
    return { ok: false, reason: result.error };
  }

  if (result.duplicate) {
    // The original request succeeded but its response was lost (or a
    // double-click). Return the ORIGINAL payment and the subscription's
    // current state — never charge again.
    const existingPaymentId = result.existingPaymentId;
    const [existingPayment, sub] = await Promise.all([
      existingPaymentId
        ? getDocById<{
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
          }>('payments', existingPaymentId)
        : null,
      getDocById<{
        memberId: string;
        serviceId: string;
        startDate: string;
        endDate: string;
        status: string;
        priceSnapshot: number;
      }>('subscriptions', data.subscriptionId),
    ]);

    if (!existingPayment || !sub) {
      return { ok: false, reason: 'subscription_not_found' };
    }

    const svc = await getDocById<{ name: string; price: number; duration: number }>(
      'services',
      sub.serviceId,
    );

    return {
      ok: true,
      duplicate: true,
      payment: {
        id: existingPayment.id,
        subscriptionId: existingPayment.subscriptionId,
        memberId: existingPayment.memberId,
        amount: existingPayment.amount,
        paymentDate: existingPayment.paymentDate,
        method: existingPayment.method,
        receiptNumber: existingPayment.receiptNumber,
        notes: existingPayment.notes,
        createdBy: existingPayment.createdBy,
        isVoided: existingPayment.isVoided,
        extendedTo: existingPayment.extendedTo,
        previousExtendedTo: existingPayment.previousExtendedTo,
      },
      subscription: {
        id: sub.id,
        memberId: sub.memberId,
        serviceId: sub.serviceId,
        startDate: sub.startDate,
        endDate: sub.endDate,
        status: sub.status,
        priceSnapshot: sub.priceSnapshot,
        service: svc
          ? { id: svc.id, name: svc.name, price: svc.price, duration: svc.duration }
          : { id: sub.serviceId, name: '', price: 0, duration: 0 },
      },
    };
  }

  const { paymentId, newEndDateIso, sub, amount } = result;

  return {
    ok: true,
    duplicate: false,
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
 * "Marked voided" + "subscription rolled back" happen inside ONE transaction:
 * a crash can never leave them half-applied, and the in-transaction
 * `isVoided` re-check rejects concurrent double-voids. Payments without
 * rollback metadata (pre-migration rows) go through the same path — the
 * rollback is reconstructed from the remaining non-voided payments, which is
 * exactly what the legacy fallback did, but without the non-atomic window.
 */
export async function voidPayment(id: string, voidedBy: string) {
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
      idempotencyKey?: string | null;
      extendedTo?: string | null;
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

    // Remaining non-voided payments on this subscription (excluding the one
    // being voided). Validity is recomputed from them — never from the voided
    // payment's own `previousExtendedTo` by itself, which can point to a
    // payment that was itself voided earlier (validity backed by refunded
    // money).
    const remainingPayments = (
      await tx.get(
        db
          .collection('payments')
          .where('subscriptionId', '==', payment.subscriptionId)
          .where('isVoided', '==', false)
          .orderBy('createdAt', 'desc'),
      )
    ).docs
      .map(
        (d) =>
          ({
            id: d.id,
            createdAt: d.data().createdAt,
            paymentDate: d.data().paymentDate,
            previousExtendedTo: d.data().previousExtendedTo,
            extendedTo: d.data().extendedTo,
          }) as PaymentForRecompute & { id: string },
      )
      .filter((p) => p.id !== id);

    const now = new Date();
    const voidedAt = now.toISOString();

    tx.update(payRef, {
      isVoided: true,
      voidedAt,
      voidedBy,
      updatedAt: voidedAt,
    });

    // The idempotency lock is tied to this payment — voiding "spends" it so a
    // stale retry of the original payment request cannot replay later.
    if (payment.idempotencyKey) {
      tx.delete(db.collection('payment-locks').doc(payment.idempotencyKey));
    }

    if (subscription) {
      let rolledBackEndDate: Date | null = null;

      if (remainingPayments.length > 0) {
        // Re-simulate the remaining payments. This is the financially correct
        // rollback: voiding a middle payment claws back its days from every
        // later payment that extended from it.
        if (serviceSnap?.exists && subscription.startDate) {
          const duration = (serviceSnap.data() as { duration?: number }).duration;
          rolledBackEndDate = recomputeEndDate(
            remainingPayments,
            subscription.startDate,
            duration,
            payment.previousExtendedTo,
          );
        }
      }

      if (rolledBackEndDate && !isNaN(rolledBackEndDate.getTime())) {
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
        // Payments remain but no rollback target could be derived (service or
        // start date missing). Keep the end date but make the state coherent:
        // status is re-derived from it and the note flags the uncertain period
        // for review — a member must not silently keep days paid by a voided
        // payment without any signal.
        const derivedStatus =
          subscription.status === 'cancelled'
            ? 'cancelled'
            : new Date(subscription.endDate) >= now
              ? 'active'
              : 'expired';
        tx.update(subRef, {
          status: derivedStatus,
          hasVoidedPayment: true,
          voidedPaymentNote: `Validity unverified after void — payment ${payment.receiptNumber} voided (rollback source missing)`,
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

  const member = await getDocById<{ firstName: string; lastName: string; photo: string | null; photoThumb?: string | null }>(
    'members',
    result.payment.memberId,
  );
  const memberPhoto = await resolveMemberPhoto(member?.photo, member?.photoThumb);

  return {
    ...result.payment,
    member: member
      ? {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          photo: memberPhoto.photo,
          photoThumb: memberPhoto.photoThumb,
        }
      : { id: result.payment.memberId, firstName: '', lastName: '', photo: null },
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
  // one page is broken once pagination kicks in). Firestore has no substring
  // search, so this is bounded by a hard cap on the most recent payments:
  // results are ordered `paymentDate desc`, so the cap only truncates
  // ancient records (searches are overwhelmingly for recent receipts).
  const SEARCH_FETCH_CAP = 2000;
  if (search) {
    const term = search.toLowerCase();
    const allMembers = await getDocs<{ firstName: string; lastName: string }>('members');
    const matchingMemberIds = new Set(
      allMembers
        .filter((m) => m.firstName.toLowerCase().includes(term) || m.lastName.toLowerCase().includes(term))
        .map((m) => m.id),
    );

    const allPayments = await getDocs<PaymentDoc>('payments', where, ['paymentDate', 'desc'], SEARCH_FETCH_CAP);
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

  const photoUrls = new Map<string, Awaited<ReturnType<typeof resolveMemberPhoto>>>();
  await Promise.all(
    memberDocs.map(async (m) => {
      photoUrls.set(m.id, await resolveMemberPhoto(m.photo, m.photoThumb));
    }),
  );

  return payments.map((p) => {
    const member = membersMap.get(p.memberId);
    const subscription = subscriptionsMap.get(p.subscriptionId);
    const serviceName = subscription ? servicesMap.get(subscription.serviceId)?.name : undefined;
    const photos = member ? photoUrls.get(member.id) : undefined;

    return {
      ...p,
      member: member
        ? {
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            photo: photos?.photo ?? null,
            photoThumb: photos?.photoThumb ?? null,
          }
        : { id: p.memberId, firstName: '', lastName: '', photo: null },
      subscription: subscription
        ? {
            id: subscription.id,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            status: deriveSubscriptionStatus(subscription),
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
