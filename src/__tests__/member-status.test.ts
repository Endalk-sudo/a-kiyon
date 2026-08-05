import { describe, it, expect } from 'vitest';
import { computeMemberStatus, findNearestEndDate } from '@/lib/member-status';

describe('Member Status', () => {
  describe('computeMemberStatus', () => {
    it('returns no_subscription when subscriptions array is empty', () => {
      expect(computeMemberStatus([])).toBe('no_subscription');
    });

    it('returns active when there is an active subscription', () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: future.toISOString(), status: 'active' },
      ];
      expect(computeMemberStatus(subs)).toBe('active');
    });

    it('returns expired when all subscriptions are expired', () => {
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: past.toISOString(), status: 'expired' },
      ];
      expect(computeMemberStatus(subs)).toBe('expired');
    });

    it('returns expiring_soon when all active subscriptions end within 7 days', () => {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: threeDaysFromNow.toISOString(), status: 'active' },
      ];
      expect(computeMemberStatus(subs)).toBe('expiring_soon');
    });

    it('returns active when any subscription extends beyond 7 days', () => {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: thirtyDaysFromNow.toISOString(), status: 'active' },
        { endDate: threeDaysFromNow.toISOString(), status: 'active' },
      ];
      expect(computeMemberStatus(subs)).toBe('active');
    });

    it('returns expired when all subscriptions are cancelled', () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: future.toISOString(), status: 'cancelled' },
      ];
      expect(computeMemberStatus(subs)).toBe('expired');
    });

    it('handles Date objects instead of strings', () => {
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: future, status: 'active' },
      ];
      expect(computeMemberStatus(subs)).toBe('active');
    });

    it('returns active when any subscription extends beyond 7 days', () => {
      const near = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const far = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: far.toISOString(), status: 'active' },
        { endDate: near.toISOString(), status: 'active' },
      ];
      expect(computeMemberStatus(subs)).toBe('active');
    });
  });

  describe('findNearestEndDate', () => {
    it('returns null when subscriptions array is empty', () => {
      expect(findNearestEndDate([])).toBeNull();
    });

    it('returns the nearest future end date', () => {
      const near = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: far.toISOString(), status: 'active' },
        { endDate: near.toISOString(), status: 'active' },
      ];
      const result = findNearestEndDate(subs);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeCloseTo(near.getTime(), -3);
    });

    it('skips cancelled subscriptions', () => {
      const near = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: near.toISOString(), status: 'cancelled' },
        { endDate: far.toISOString(), status: 'active' },
      ];
      const result = findNearestEndDate(subs);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeCloseTo(far.getTime(), -3);
    });

    it('returns null when all subscriptions are expired', () => {
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const subs = [
        { endDate: past.toISOString(), status: 'expired' },
      ];
      expect(findNearestEndDate(subs)).toBeNull();
    });
  });
});
