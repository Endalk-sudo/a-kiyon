const PHONE_DOMAIN = '@a-kiyon.app';

export const PHONE_REGEX = /^\+2519\d{8}$/;

/** Strips everything but digits and normalizes to +251XXXXXXXXX. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('251')) return `+251${digits.slice(3, 12)}`;
  if (digits.startsWith('09')) return `+251${digits.slice(1, 10)}`;
  return `+251${digits.slice(0, 9)}`;
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

/**
 * Internal Firebase Auth email derived from a phone number. Firebase
 * email/password auth can't use phone numbers directly, so every account is
 * stored under a synthetic email nobody checks; the UI only ever shows the
 * phone. Stripping the `+` keeps the local part RFC-safe.
 */
export function phoneToEmail(phone: string): string {
  const normalized = normalizePhone(phone);
  return `${normalized.replace('+', '')}${PHONE_DOMAIN}`;
}

/** Reverse of `phoneToEmail` — null when the email isn't one of ours. */
export function emailToPhone(email: string): string | null {
  if (!email.endsWith(PHONE_DOMAIN)) return null;
  const local = email.slice(0, -PHONE_DOMAIN.length);
  if (!/^\d{12}$/.test(local)) return null;
  return `+${local}`;
}

export function isSyntheticEmail(email: string): boolean {
  return emailToPhone(email) !== null;
}
