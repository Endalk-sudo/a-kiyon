import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';

const TEST_PREFIX = 'test_member_svc_';

async function cleanup() {
  const existing = await db.collection('members').where('firstName', '>=', TEST_PREFIX).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

describe('Member Service (integration)', () => {
  beforeAll(async () => {
    await cleanup();
    await db.collection('services').doc('test_svc_int').set({
      name: 'Test Service',
      price: 500,
      duration: 30,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await cleanup();
    await db.collection('services').doc('test_svc_int').delete().catch(() => {});
  });

  describe('createMember', () => {
    it('creates a member and returns it with id', async () => {
      const { createMember } = await import('@/services/member.service');
      const member = await createMember({
        firstName: `${TEST_PREFIX}John`,
        lastName: 'Doe',
        phone: '+251911000001',
      });
      expect(member.id).toBeTruthy();
      expect(member.firstName).toBe(`${TEST_PREFIX}John`);
      expect(member.lastName).toBe('Doe');
      expect(member.phone).toBe('+251911000001');
      expect(member.isDeleted).toBe(false);
      expect(member.createdAt).toBeTruthy();
      expect(member.updatedAt).toBeTruthy();
      await db.collection('members').doc(member.id).delete();
    });

    it('creates a member with all optional fields', async () => {
      const { createMember } = await import('@/services/member.service');
      const member = await createMember({
        firstName: `${TEST_PREFIX}Full`,
        lastName: 'Member',
        phone: '+251911000002',
        address: 'Addis Ababa',
        weight: 70,
        height: 175,
        bloodType: 'O+',
        emergencyContact: '+251911000003',
        notes: 'Test notes',
      });
      expect(member.address).toBe('Addis Ababa');
      expect(member.weight).toBe(70);
      expect(member.height).toBe(175);
      expect(member.bloodType).toBe('O+');
      await db.collection('members').doc(member.id).delete();
    });
  });

  describe('listMembers', () => {
    let memberIds: string[] = [];

    beforeAll(async () => {
      for (let i = 0; i < 5; i++) {
        const ref = await db.collection('members').add({
          firstName: `${TEST_PREFIX}ListUser${i}`,
          lastName: 'Test',
          phone: `+25191100001${i}`,
          isDeleted: false,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        memberIds.push(ref.id);
      }
    });

    afterAll(async () => {
      const batch = db.batch();
      memberIds.forEach((id) => batch.delete(db.collection('members').doc(id)));
      await batch.commit();
    });

    it('lists members with pagination', async () => {
      const { listMembers } = await import('@/services/member.service');
      const result = await listMembers({ page: 1, limit: 10 });
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination).toHaveProperty('page', 1);
      expect(result.pagination).toHaveProperty('limit', 10);
    });

    it('respects limit parameter', async () => {
      const { listMembers } = await import('@/services/member.service');
      const result = await listMembers({ page: 1, limit: 2 });
      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.pagination.limit).toBe(2);
    });
  });

  describe('listMembers search (across all pages)', () => {
    let searchMemberIds: string[] = [];
    let searchSubIds: string[] = [];

    beforeAll(async () => {
      const batch = db.batch();
      for (let i = 0; i < 5; i++) {
        const ref = db.collection('members').doc();
        batch.set(ref, {
          firstName: `${TEST_PREFIX}DeepSearch${i}`,
          lastName: 'Test',
          phone: `+25191100030${i}`,
          isDeleted: false,
          deletedAt: null,
          createdAt: new Date(Date.now() + i * 60_000).toISOString(),
          updatedAt: new Date(Date.now() + i * 60_000).toISOString(),
        });
        searchMemberIds.push(ref.id);
      }
      await batch.commit();
    });

    afterAll(async () => {
      const batch = db.batch();
      searchMemberIds.forEach((id) => batch.delete(db.collection('members').doc(id)));
      searchSubIds.forEach((id) => batch.delete(db.collection('subscriptions').doc(id)));
      await batch.commit();
    });

    it('finds members beyond the first page with correct totals', async () => {
      const { listMembers } = await import('@/services/member.service');
      const result = await listMembers({ search: 'DeepSearch', page: 3, limit: 2 });
      expect(result.pagination.total).toBe(5);
      expect(result.data.length).toBe(1);
      expect(result.data[0].firstName).toBe(`${TEST_PREFIX}DeepSearch0`);
    });

    it('combines search with status filter deterministically', async () => {
      const { createDoc } = await import('@/lib/db');
      const sub = await createDoc('subscriptions', {
        memberId: searchMemberIds[2],
        serviceId: 'test_svc_int',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        priceSnapshot: 500,
      });
      searchSubIds.push(sub.id);

      const { listMembers } = await import('@/services/member.service');
      const result = await listMembers({ search: 'DeepSearch', statusFilter: 'active', page: 1, limit: 10 });
      expect(result.pagination.total).toBe(1);
      expect(result.data[0].id).toBe(searchMemberIds[2]);
    });
  });

  describe('getMember', () => {
    let memberId: string;

    beforeAll(async () => {
      const ref = await db.collection('members').add({
        firstName: `${TEST_PREFIX}GetTest`,
        lastName: 'User',
        phone: '+251911000100',
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      memberId = ref.id;
    });

    afterAll(async () => {
      await db.collection('members').doc(memberId).delete().catch(() => {});
    });

    it('returns a member by id', async () => {
      const { getMember } = await import('@/services/member.service');
      const member = await getMember(memberId);
      expect(member).not.toBeNull();
      expect(member!.id).toBe(memberId);
      expect(member!.firstName).toBe(`${TEST_PREFIX}GetTest`);
    });

    it('returns null for non-existent member', async () => {
      const { getMember } = await import('@/services/member.service');
      const member = await getMember('nonexistent_id');
      expect(member).toBeNull();
    });
  });

  describe('softDeleteMember / restoreMember', () => {
    let memberId: string;

    beforeAll(async () => {
      const ref = await db.collection('members').add({
        firstName: `${TEST_PREFIX}DeleteTest`,
        lastName: 'User',
        phone: '+251911000200',
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      memberId = ref.id;
    });

    afterAll(async () => {
      await db.collection('members').doc(memberId).delete().catch(() => {});
    });

    it('soft-deletes a member', async () => {
      const { softDeleteMember } = await import('@/services/member.service');
      const deleted = await softDeleteMember(memberId);
      expect(deleted).not.toBeNull();
      expect(deleted!.isDeleted).toBe(true);
      expect(deleted!.deletedAt).toBeTruthy();
    });

    it('restores a soft-deleted member', async () => {
      const { restoreMember } = await import('@/services/member.service');
      const restored = await restoreMember(memberId);
      expect(restored).not.toBeNull();
      expect(restored!.isDeleted).toBe(false);
      expect(restored!.deletedAt).toBeNull();
    });
  });

  describe('updateMember', () => {
    let memberId: string;

    beforeAll(async () => {
      const ref = await db.collection('members').add({
        firstName: `${TEST_PREFIX}UpdateTest`,
        lastName: 'User',
        phone: '+251911000300',
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      memberId = ref.id;
    });

    afterAll(async () => {
      await db.collection('members').doc(memberId).delete().catch(() => {});
    });

    it('updates member fields', async () => {
      const { updateMember } = await import('@/services/member.service');
      const updated = await updateMember(memberId, { firstName: `${TEST_PREFIX}Updated`, phone: '+251911000999' });
      expect(updated).not.toBeNull();
      expect(updated!.firstName).toBe(`${TEST_PREFIX}Updated`);
      expect(updated!.phone).toBe('+251911000999');
    });
  });
});
