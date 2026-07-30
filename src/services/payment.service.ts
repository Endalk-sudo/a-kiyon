import { getDocById, getDocs, countDocs, createDoc, updateDoc } from '@/lib/db';
import type { WhereClause } from '@/lib/db';
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

export async function createPayment(data: {
  subscriptionId: string;
  memberId: string;
  amount: number;
  paymentDate: Date;
  method: string;
  notes?: string | null;
  createdBy: string;
}) {
  const receiptNumber = generateReceiptNumber();

  const payment = await createDoc<{
    subscriptionId: string;
    memberId: string;
    amount: number;
    paymentDate: string;
    method: string;
    receiptNumber: string;
    notes: string | null;
    createdBy: string;
    isVoided: boolean;
  }>('payments', {
    subscriptionId: data.subscriptionId,
    memberId: data.memberId,
    amount: data.amount,
    paymentDate: data.paymentDate instanceof Date ? data.paymentDate.toISOString() : data.paymentDate,
    method: data.method,
    receiptNumber,
    notes: data.notes || null,
    createdBy: data.createdBy,
    isVoided: false,
  });

  const [member, subscription] = await Promise.all([
    getDocById<{ firstName: string; lastName: string; photo: string | null }>('members', payment.memberId),
    getDocById<{ priceSnapshot: number; serviceId: string }>('subscriptions', payment.subscriptionId),
  ]);

  let serviceName: string | undefined;
  if (subscription) {
    const service = await getDocById<{ name: string }>('services', subscription.serviceId);
    serviceName = service?.name;
  }

  return {
    ...payment,
    member: member || { id: payment.memberId, firstName: '', lastName: '', photo: null },
    subscription: subscription
      ? { id: subscription.id, priceSnapshot: subscription.priceSnapshot, service: { name: serviceName || '' } }
      : { id: payment.subscriptionId, priceSnapshot: 0, service: { name: '' } },
  };
}

export async function voidPayment(id: string, voidedBy: string) {
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
    getDocById<{ priceSnapshot: number; serviceId: string; status: string }>('subscriptions', payment.subscriptionId),
  ]);

  let serviceName: string | undefined;
  if (subscription) {
    const service = await getDocById<{ name: string }>('services', subscription.serviceId);
    serviceName = service?.name;

    const otherPayments = await countDocs('payments', [
      ['subscriptionId', '==', payment.subscriptionId],
      ['isVoided', '==', false],
    ]);
    if (otherPayments === 0 && subscription.status === 'active') {
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
  }

  return {
    ...payment,
    member: member || { id: payment.memberId, firstName: '', lastName: '', photo: null },
    subscription: subscription
      ? { id: subscription.id, priceSnapshot: subscription.priceSnapshot, service: { name: serviceName || '' } }
      : { id: payment.subscriptionId, priceSnapshot: 0, service: { name: '' } },
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
};

export async function listPayments(options: PaymentListOptions = {}) {
  const { page = 1, limit = 20, memberId, method, isVoided, startDate, endDate } = options;

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

  const [payments, total] = await Promise.all([
    getDocs<{
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
    }>('payments', where, ['paymentDate', 'desc'], limit, (page - 1) * limit),
    countDocs('payments', where),
  ]);

  const data = await Promise.all(
    payments.map(async (p) => {
      const [member, subscription] = await Promise.all([
        getDocById<{ firstName: string; lastName: string; photo: string | null }>('members', p.memberId),
        getDocById<{ startDate: string; endDate: string; status: string; priceSnapshot: number; serviceId: string }>('subscriptions', p.subscriptionId),
      ]);

      let serviceName: string | undefined;
      if (subscription) {
        const service = await getDocById<{ name: string }>('services', subscription.serviceId);
        serviceName = service?.name;
      }

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
    }),
  );

  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}
