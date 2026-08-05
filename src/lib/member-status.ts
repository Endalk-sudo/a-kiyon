export type MemberStatus = 'active' | 'expiring_soon' | 'expired' | 'no_subscription';

export interface SubscriptionInfo {
  endDate: Date | string;
  status: string;
}

function toDate(v: Date | string): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

export function computeMemberStatus(subscriptions: SubscriptionInfo[]): MemberStatus {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const activeEndDates = subscriptions
    .filter((s) => s.status !== 'cancelled')
    .map((s) => toDate(s.endDate))
    .filter((endDate) => endDate >= now);

  if (activeEndDates.length === 0) {
    return subscriptions.length === 0 ? 'no_subscription' : 'expired';
  }

  // A subscription extending beyond the next 7 days means the member has
  // guaranteed access — a shorter concurrent subscription must not shadow it.
  const hasLongTermAccess = activeEndDates.some((endDate) => endDate > sevenDaysFromNow);
  return hasLongTermAccess ? 'active' : 'expiring_soon';
}

export function findNearestEndDate(subscriptions: SubscriptionInfo[]): Date | null {
  const now = new Date();
  const active = subscriptions
    .filter((s) => toDate(s.endDate) >= now && s.status !== 'cancelled')
    .sort((a, b) => toDate(a.endDate).getTime() - toDate(b.endDate).getTime());

  return active.length > 0 ? toDate(active[0].endDate) : null;
}
