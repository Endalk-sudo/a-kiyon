import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminAuth } from '@/lib/firebase-admin';
import { db } from '@/lib/db';

const PREFIX = 'test_usr_svc_';
let createdUserIds: string[] = [];

async function cleanup() {
  if (createdUserIds.length > 0) {
    await adminAuth.deleteUsers(createdUserIds).catch(() => {});
  }
  createdUserIds = [];
}

describe('User Service (integration)', () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createUser', () => {
    it('creates a user with email, name, password, and role', async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        email: `${PREFIX}owner@test.com`,
        name: 'Test Owner',
        password: 'test123456',
        role: 'owner',
      });

      expect(user.id).toBeTruthy();
      expect(user.email).toBe(`${PREFIX}owner@test.com`);
      expect(user.name).toBe('Test Owner');
      expect(user.role).toBe('owner');
      expect(user.isActive).toBe(true);
      createdUserIds.push(user.id);
    });

    it('creates a user with manager role', async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        email: `${PREFIX}manager@test.com`,
        name: 'Test Manager',
        password: 'test123456',
        role: 'manager',
        phone: '+251911000001',
      });

      expect(user.role).toBe('manager');
      expect(user.phone).toBe('+251911000001');
      createdUserIds.push(user.id);
    });

    it('rejects duplicate email', async () => {
      const { createUser } = await import('@/services/user.service');
      try {
        await createUser({
          email: `${PREFIX}owner@test.com`,
          name: 'Duplicate',
          password: 'test123456',
          role: 'manager',
        });
        expect('Should have thrown').toBe('never');
      } catch (e: any) {
        expect(e.message).toBeTruthy();
      }
    });
  });

  describe('listUsers', () => {
    it('lists all users including newly created ones', async () => {
      const { listUsers } = await import('@/services/user.service');
      const result = await listUsers();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const found = result.data.find((u: any) => u.email === `${PREFIX}owner@test.com`);
      expect(found).toBeDefined();
      expect(found!.role).toBe('owner');
    });
  });

  describe('getUser', () => {
    it('returns a user by id', async () => {
      const { createUser, getUser } = await import('@/services/user.service');
      const created = await createUser({
        email: `${PREFIX}getuser@test.com`,
        name: 'Get User',
        password: 'test123456',
        role: 'manager',
      });
      createdUserIds.push(created.id);

      const user = await getUser(created.id);
      expect(user).not.toBeNull();
      expect(user!.name).toBe('Get User');
      expect(user!.role).toBe('manager');
    });
  });

  describe('updateUser', () => {
    let userId: string;

    beforeAll(async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        email: `${PREFIX}updateuser@test.com`,
        name: 'Update User',
        password: 'test123456',
        role: 'manager',
      });
      userId = user.id;
      createdUserIds.push(userId);
    });

    it('updates user name and role', async () => {
      const { updateUser } = await import('@/services/user.service');
      const updated = await updateUser(userId, { name: 'Updated Name', role: 'owner' });
      expect(updated.name).toBe('Updated Name');
      expect(updated.role).toBe('owner');
    });
  });

  describe('toggleUserActive', () => {
    let userId: string;

    beforeAll(async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        email: `${PREFIX}toggleuser@test.com`,
        name: 'Toggle User',
        password: 'test123456',
        role: 'manager',
      });
      userId = user.id;
      createdUserIds.push(userId);
    });

    it('deactivates an active user', async () => {
      const { toggleUserActive } = await import('@/services/user.service');
      const deactivated = await toggleUserActive(userId);
      expect(deactivated.isActive).toBe(false);
    });

    it('reactivates a deactivated user', async () => {
      const { toggleUserActive } = await import('@/services/user.service');
      const reactivated = await toggleUserActive(userId);
      expect(reactivated.isActive).toBe(true);
    });
  });
});
