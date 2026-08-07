import { describe, it, expect } from 'vitest';
import {
  createMemberSchema,
  updateMemberSchema,
  createServiceSchema,
  updateServiceSchema,
  createSubscriptionSchema,
  renewSubscriptionSchema,
  updateSubscriptionSchema,
  createPaymentSchema,
  createUserSchema,
  updateUserSchema,
} from '@/lib/schemas';

describe('Schemas', () => {
  describe('createMemberSchema', () => {
    it('accepts valid member data', () => {
      const data = { firstName: 'John', lastName: 'Doe' };
      const result = createMemberSchema.parse(data);
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('accepts full member data with all optional fields', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+251911000000',
        address: 'Addis Ababa',
        weight: 70,
        height: 175,
        bloodType: 'O+',
        emergencyContact: '+251911000001',
        notes: 'Test',
      };
      const result = createMemberSchema.parse(data);
      expect(result.bloodType).toBe('O+');
      expect(result.weight).toBe(70);
    });

    it('rejects missing firstName', () => {
      expect(() => createMemberSchema.parse({ lastName: 'Doe' })).toThrow();
    });

    it('rejects empty firstName', () => {
      expect(() => createMemberSchema.parse({ firstName: '', lastName: 'Doe' })).toThrow();
    });

    it('rejects invalid blood type', () => {
      expect(() =>
        createMemberSchema.parse({ firstName: 'John', lastName: 'Doe', bloodType: 'X' })
      ).toThrow();
    });

    it('rejects negative weight', () => {
      expect(() =>
        createMemberSchema.parse({ firstName: 'John', lastName: 'Doe', weight: -10 })
      ).toThrow();
    });

    it('coerces string numbers for weight', () => {
      const result = createMemberSchema.parse({ firstName: 'John', lastName: 'Doe', weight: '70' });
      expect(result.weight).toBe(70);
    });
  });

  describe('updateMemberSchema', () => {
    it('accepts partial update data', () => {
      const result = updateMemberSchema.parse({ firstName: 'Jane' });
      expect(result.firstName).toBe('Jane');
    });

    it('accepts empty object', () => {
      const result = updateMemberSchema.parse({});
      expect(Object.keys(result).length).toBe(0);
    });

    it('rejects empty firstName when provided', () => {
      expect(() => updateMemberSchema.parse({ firstName: '' })).toThrow();
    });

    it('allows null for nullable fields', () => {
      const result = updateMemberSchema.parse({ phone: null, notes: null });
      expect(result.phone).toBeNull();
      expect(result.notes).toBeNull();
    });
  });

  describe('createServiceSchema', () => {
    it('accepts valid service data', () => {
      const data = { name: 'Gym', price: 500, duration: 30 };
      const result = createServiceSchema.parse(data);
      expect(result.name).toBe('Gym');
      expect(result.price).toBe(500);
      expect(result.duration).toBe(30);
    });

    it('accepts optional fields', () => {
      const data = { name: 'Gym', price: 500, duration: 30, nameAm: 'ጂም', isActive: true };
      const result = createServiceSchema.parse(data);
      expect(result.nameAm).toBe('ጂም');
      expect(result.isActive).toBe(true);
    });

    it('rejects missing name', () => {
      expect(() => createServiceSchema.parse({ price: 500, duration: 30 })).toThrow();
    });

    it('rejects negative price', () => {
      expect(() =>
        createServiceSchema.parse({ name: 'Gym', price: -10, duration: 30 })
      ).toThrow();
    });

    it('rejects non-integer duration', () => {
      expect(() =>
        createServiceSchema.parse({ name: 'Gym', price: 500, duration: 30.5 })
      ).toThrow();
    });
  });

  describe('updateServiceSchema', () => {
    it('accepts partial update', () => {
      const result = updateServiceSchema.parse({ price: 600 });
      expect(result.price).toBe(600);
    });
  });

  describe('createSubscriptionSchema', () => {
    it('accepts valid subscription data', () => {
      const data = { memberId: 'm1', serviceId: 's1', paymentMethod: 'cash' };
      const result = createSubscriptionSchema.parse(data);
      expect(result.memberId).toBe('m1');
      expect(result.serviceId).toBe('s1');
      expect(result.paymentMethod).toBe('cash');
    });

    it('rejects missing memberId', () => {
      expect(() =>
        createSubscriptionSchema.parse({ serviceId: 's1', paymentMethod: 'cash' })
      ).toThrow();
    });

    it('rejects invalid payment method', () => {
      expect(() =>
        createSubscriptionSchema.parse({
          memberId: 'm1',
          serviceId: 's1',
          paymentMethod: 'bitcoin',
        })
      ).toThrow();
    });

    it('accepts all payment methods', () => {
      const methods = ['cash', 'bank_transfer', 'mobile_money'];
      for (const method of methods) {
        const result = createSubscriptionSchema.parse({
          memberId: 'm1',
          serviceId: 's1',
          paymentMethod: method,
        });
        expect(result.paymentMethod).toBe(method);
      }
    });
  });

  describe('renewSubscriptionSchema', () => {
    it('accepts valid renew data', () => {
      const result = renewSubscriptionSchema.parse({ paymentMethod: 'cash' });
      expect(result.paymentMethod).toBe('cash');
    });

    it('rejects missing payment method', () => {
      expect(() => renewSubscriptionSchema.parse({})).toThrow();
    });
  });

  describe('updateSubscriptionSchema', () => {
    it('accepts manual cancellation', () => {
      const result = updateSubscriptionSchema.parse({ status: 'cancelled' });
      expect(result.status).toBe('cancelled');
    });

    it('rejects invalid status', () => {
      expect(() => updateSubscriptionSchema.parse({ status: 'nonexistent' })).toThrow();
    });

    it('rejects manually setting active or expired status', () => {
      // Validity must be derived from payments (money in = days added), not
      // from raw status writes.
      expect(() => updateSubscriptionSchema.parse({ status: 'active' })).toThrow();
      expect(() => updateSubscriptionSchema.parse({ status: 'expired' })).toThrow();
    });

    it('accepts notes-only updates', () => {
      const result = updateSubscriptionSchema.parse({ notes: 'flagged' });
      expect(result.notes).toBe('flagged');
    });
  });

  describe('createPaymentSchema', () => {
    it('accepts valid payment data', () => {
      const data = {
        subscriptionId: 's1',
        amount: 500,
        method: 'cash',
      };
      const result = createPaymentSchema.parse(data);
      expect(result.amount).toBe(500);
      expect(result.method).toBe('cash');
    });

    it('rejects missing required fields', () => {
      expect(() => createPaymentSchema.parse({ amount: 500 })).toThrow();
    });

    it('rejects zero amount', () => {
      expect(() =>
        createPaymentSchema.parse({
          subscriptionId: 's1',
          amount: 0,
          method: 'cash',
        })
      ).toThrow();
    });

    it('rejects negative amount', () => {
      expect(() =>
        createPaymentSchema.parse({
          subscriptionId: 's1',
          amount: -100,
          method: 'cash',
        })
      ).toThrow();
    });
  });

  describe('createUserSchema', () => {
    it('accepts valid user data', () => {
      const data = { phone: '+251911000000', name: 'Test', password: 'password123', role: 'manager' };
      const result = createUserSchema.parse(data);
      expect(result.phone).toBe('+251911000000');
      expect(result.role).toBe('manager');
    });

    it('accepts all valid roles', () => {
      const roles = ['owner', 'manager', 'reader'];
      for (const role of roles) {
        const result = createUserSchema.parse({
          phone: '+251911000000',
          name: 'Test',
          password: 'password123',
          role,
        });
        expect(result.role).toBe(role);
      }
    });

    it('rejects missing phone', () => {
      expect(() =>
        createUserSchema.parse({
          name: 'Test',
          password: 'password123',
          role: 'manager',
        })
      ).toThrow();
    });

    it('rejects invalid phone format', () => {
      expect(() =>
        createUserSchema.parse({
          phone: '0911000000',
          name: 'Test',
          password: 'password123',
          role: 'manager',
        })
      ).toThrow();
    });

    it('rejects short password', () => {
      expect(() =>
        createUserSchema.parse({
          phone: '+251911000000',
          name: 'Test',
          password: '12345',
          role: 'manager',
        })
      ).toThrow();
    });

    it('rejects invalid role', () => {
      expect(() =>
        createUserSchema.parse({
          phone: '+251911000000',
          name: 'Test',
          password: 'password123',
          role: 'superadmin',
        })
      ).toThrow();
    });
  });

  describe('updateUserSchema', () => {
    it('accepts partial update', () => {
      const result = updateUserSchema.parse({ name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('rejects short password', () => {
      expect(() => updateUserSchema.parse({ password: '12345' })).toThrow();
    });

    it('rejects invalid role', () => {
      expect(() => updateUserSchema.parse({ role: 'invalid' })).toThrow();
    });

    it('rejects invalid phone format', () => {
      expect(() => updateUserSchema.parse({ phone: '0999999999' })).toThrow();
    });

    it('accepts phone null', () => {
      const result = updateUserSchema.parse({ phone: null });
      expect(result.phone).toBeNull();
    });
  });
});
