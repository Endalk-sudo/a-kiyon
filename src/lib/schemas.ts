import { z } from 'zod';

export const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const sexes = ['male', 'female'] as const;
export const paymentMethods = ['cash', 'bank_transfer', 'mobile_money'] as const;
export const userRoles = ['owner', 'manager', 'reader'] as const;

/** Staff phone numbers are the login identifiers — always +251XXXXXXXXX. */
export const phonePattern = /^\+251\d{9}$/;

/**
 * User-supplied dates are accepted either as Ethiopian calendar strings
 * ("15/08/2017" or "15-08-2017", optional "EC" suffix) or as Gregorian ISO
 * strings ("2024-01-15" or a full ISO timestamp — what the UI sends after
 * converting an Ethiopian date input). Anything else is rejected up front
 * instead of silently producing an Invalid Date downstream.
 */
export const ethiopianOrIsoDatePattern =
  /^(\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*(EC)?|\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?)$/i;

const userDate = (message: string) => z.string().regex(ethiopianOrIsoDatePattern, message);

// Length caps so pathological payloads (multi-MB strings) never hit Firestore.
const text = (max = 500) => z.string().max(max, `Must be at most ${max} characters`);
const name = () => text(100);

// Member phones are +251XXXXXXXXX like staff phones; empty string is treated
// as "no phone" by the UI (sent as null), so null/undefined stay allowed.
const memberPhone = () =>
  z
    .string()
    .regex(phonePattern, 'Phone must be in format +251XXXXXXXXX')
    .optional()
    .nullable();

// Optional body measurements (cm/kg) — finite with physiological sanity
// bounds so typo'd or extreme values (e.g. 1e999 → Infinity) never persist.
const measurement = (min: number, max: number) =>
  z.coerce.number().finite().min(min).max(max).optional().nullable();

export const createMemberSchema = z.object({
  firstName: name().min(1, 'First name is required'),
  lastName: name().min(1, 'Last name is required'),
  phone: memberPhone(),
  photo: text().optional().nullable(),
  photoThumb: text().optional().nullable(),
  address: text().optional().nullable(),
  weight: measurement(5, 500),
  height: measurement(50, 300),
  bloodType: z.enum(bloodTypes).optional().nullable(),
  emergencyContact: text().optional().nullable(),
  notes: text(2000).optional().nullable(),
  sex: z.enum(sexes).optional().nullable(),
  neck: measurement(10, 100),
  waist: measurement(20, 300),
  hip: measurement(20, 300),
  serviceId: z.string().min(1).max(100).optional(),
  paymentMethod: z.enum(paymentMethods).optional(),
  paymentDate: userDate('Invalid Ethiopian date format').optional(),
  subscriptionNotes: text().optional(),
}).strict().superRefine((data, ctx) => {
  if (data.serviceId && !data.paymentMethod) {
    ctx.addIssue({
      code: 'custom',
      path: ['paymentMethod'],
      message: 'Payment method is required when a subscription is created',
    });
  }
});

export const updateMemberSchema = z.object({
  firstName: name().min(1).optional(),
  lastName: name().min(1).optional(),
  phone: memberPhone(),
  photo: text().optional().nullable(),
  photoThumb: text().optional().nullable(),
  address: text().optional().nullable(),
  weight: measurement(5, 500),
  height: measurement(50, 300),
  bloodType: z.enum(bloodTypes).optional().nullable(),
  emergencyContact: text().optional().nullable(),
  notes: text(2000).optional().nullable(),
  sex: z.enum(sexes).optional().nullable(),
  neck: measurement(10, 100),
  waist: measurement(20, 300),
  hip: measurement(20, 300),
}).strict();

export const createServiceSchema = z.object({
  name: name().min(1, 'Name is required'),
  nameAm: text().optional().nullable(),
  description: text(2000).optional().nullable(),
  descriptionAm: text(2000).optional().nullable(),
  price: z.coerce.number().nonnegative('Price must be non-negative'),
  duration: z.coerce.number().int().positive('Duration must be a positive integer (days)'),
  isActive: z.boolean().optional(),
}).strict();

export const updateServiceSchema = z.object({
  name: name().min(1).optional(),
  nameAm: text().optional().nullable(),
  description: text(2000).optional().nullable(),
  descriptionAm: text(2000).optional().nullable(),
  price: z.coerce.number().nonnegative().optional(),
  duration: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const createSubscriptionSchema = z.object({
  memberId: z.string().min(1, 'memberId is required').max(100),
  serviceId: z.string().min(1, 'serviceId is required').max(100),
  startDate: userDate('Invalid start date format').optional(),
  paymentMethod: z.enum(paymentMethods),
  paymentDate: userDate('Invalid Ethiopian date format').optional(),
  notes: text().optional(),
}).strict();

export const renewSubscriptionSchema = z.object({
  paymentMethod: z.enum(paymentMethods),
}).strict();

export const updateSubscriptionSchema = z.object({
  // Status can only be manually set to `cancelled`. `active`/`expired` are
  // derived from payments and time — reactivation requires a payment (renew),
  // never a raw status write.
  status: z.literal('cancelled').optional(),
  notes: text().optional().nullable(),
}).strict();

export const createPaymentSchema = z.object({
  subscriptionId: z.string().min(1, 'subscriptionId is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  method: z.enum(paymentMethods),
  notes: text().optional().nullable(),
}).strict();

export const createUserSchema = z.object({
  phone: z.string().regex(phonePattern, 'Phone must be in format +251XXXXXXXXX'),
  name: name().min(1, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  role: z.enum(userRoles),
}).strict();

export const updateUserSchema = z.object({
  name: name().min(1).optional(),
  password: z.string().min(6).max(128).optional(),
  role: z.enum(userRoles).optional(),
  phone: z.string().regex(phonePattern, 'Phone must be in format +251XXXXXXXXX').optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();
