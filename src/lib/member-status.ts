export type MemberStatus = 'active' | 'expiring_soon' | 'expired' | 'no_subscription';

export interface SubscriptionInfo {
  endDate: Date | string;
  status: string;
}

function toDate(v: Date | string): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

export function computeMemberStatus(subscriptions: SubscriptionInfo[]): MemberStatus {
  if (subscriptions.length === 0) return 'no_subscription';

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const hasActive = subscriptions.some(
    (s) => toDate(s.endDate) >= now && s.status !== 'cancelled'
  );
  const hasExpiringSoon = subscriptions.some(
    (s) => toDate(s.endDate) >= now && toDate(s.endDate) <= sevenDaysFromNow && s.status !== 'cancelled'
  );

  if (hasExpiringSoon) return 'expiring_soon';
  if (hasActive) return 'active';
  return 'expired';
}

export function findNearestEndDate(subscriptions: SubscriptionInfo[]): Date | null {
  const now = new Date();
  const active = subscriptions
    .filter((s) => toDate(s.endDate) >= now && s.status !== 'cancelled')
    .sort((a, b) => toDate(a.endDate).getTime() - toDate(b.endDate).getTime());

  return active.length > 0 ? toDate(active[0].endDate) : null;
}
