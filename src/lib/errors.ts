/**
 * Single source of truth for error messages that are safe to show to the
 * client. `apiHandler` consults this list before returning a raw message;
 * `sanitizeError` uses it client-side to decide whether to surface the
 * server's message or a generic fallback. Anything not listed here is
 * treated as an internal error (generic 500 / fallback text).
 */
export const SAFE_ERROR_MESSAGES = [
  'A user with this email already exists',
  'A user with this phone number already exists',
  'Cannot deactivate the last active owner',
  'Cannot demote the last active owner',
  'Cannot record a payment for an inactive subscription',
  'Cannot renew subscription',
  'Cannot renew subscription for a deleted member',
  'Cannot renew this subscription',
  'Cannot update a deleted member',
  'File too large. Maximum size is 5MB.',
  'Forbidden',
  'Image too large. Maximum dimensions are 6000x4000.',
  'Internal server error',
  'Invalid Ethiopian date format',
  'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
  'Invalid image file',
  'Invalid JSON body',
  'Invalid payment date format',
  'Invalid start date format',
  'Member already has an active subscription for this service',
  'Member is already deleted',
  'Member is not deleted',
  'Member not found',
  'No photo provided',
  'Payment amount must equal the current service price',
  'Payment date cannot be in the future',
  'Payment is already voided',
  'Payment not found',
  'Service is already inactive',
  'Service is not active',
  'Service not found',
  'Start date cannot be in the future',
  'Storage not configured',
  'Subscription not found',
  'Unauthorized',
  'Unknown cleanup action',
  'User is already deactivated',
  'User not found',
  'You cannot deactivate yourself',
  'You cannot demote yourself',
] as const;

const SAFE_ERROR_SET = new Set<string>(SAFE_ERROR_MESSAGES);

export function sanitizeError(
  err: unknown,
  locale: string,
  enFallback: string,
  amFallback: string
): string {
  if (err instanceof Error && SAFE_ERROR_SET.has(err.message)) {
    return err.message;
  }
  return locale === 'am' ? amFallback : enFallback;
}
