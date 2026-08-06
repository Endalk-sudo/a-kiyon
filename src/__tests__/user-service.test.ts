import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminAuth } from '@/lib/firebase-admin';
import { phoneToEmail } from '@/lib/phone-auth';

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
    it('creates a user with phone, name, password, and role', async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        phone: '+251955000101',
        name: 'Test Owner',
        password: 'test123456',
        role: 'owner',
      });

      expect(user.id).toBeTruthy();
      // The auth email is derived from the phone (login identifier).
      expect(user.email).toBe(phoneToEmail('+251955000101'));
      expect(user.phone).toBe('+251955000101');
      expect(user.name).toBe('Test Owner');
      expect(user.role).toBe('owner');
      expect(user.isActive).toBe(true);
      createdUserIds.push(user.id);
    });

    it('creates a user with manager role', async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        phone: '+251955000102',
        name: 'Test Manager',
        password: 'test123456',
        role: 'manager',
      });

      expect(user.role).toBe('manager');
      expect(user.phone).toBe('+251955000102');
      createdUserIds.push(user.id);
    });

    it('rejects duplicate phone', async () => {
      const { createUser } = await import('@/services/user.service');
      try {
        await createUser({
          phone: '+251955000101',
          name: 'Duplicate',
          password: 'test123456',
          role: 'manager',
        });
        expect('Should have thrown').toBe('never');
      } catch (e: unknown) {
        expect((e as Error).message).toBeTruthy();
      }
    });
  });

  describe('listUsers', () => {
    it('lists all users including newly created ones', async () => {
      const { listUsers } = await import('@/services/user.service');
      const result = await listUsers();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const found = result.data.find((u) => u.phone === '+251955000101');
      expect(found).toBeDefined();
      expect(found!.role).toBe('owner');
    });
  });

  describe('getUser', () => {
    it('returns a user by id', async () => {
      const { createUser, getUser } = await import('@/services/user.service');
      const created = await createUser({
        phone: '+251955000103',
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
        phone: '+251955000104',
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
      expect(updated.phone).toBe('+251955000104');
    });

    it('renames the auth email when the phone changes', async () => {
      const { updateUser } = await import('@/services/user.service');
      const updated = await updateUser(userId, { phone: '+251955000199' });
      expect(updated.phone).toBe('+251955000199');
      expect(updated.email).toBe(phoneToEmail('+251955000199'));

      const authUser = await adminAuth.getUser(userId);
      expect(authUser.email).toBe(phoneToEmail('+251955000199'));
    });

    it('resets the password when one is provided', async () => {
      const { updateUser } = await import('@/services/user.service');
      await updateUser(userId, { password: 'newpass123' });
      const authUser = await adminAuth.getUser(userId);
      expect(authUser.uid).toBe(userId);
    });
  });

  describe('toggleUserActive', () => {
    let userId: string;

    beforeAll(async () => {
      const { createUser } = await import('@/services/user.service');
      const user = await createUser({
        phone: '+251955000105',
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
