const SAFE_ERROR_MESSAGES = [
  'A user with this email already exists',
  'Cannot renew subscription for a deleted member',
  'Cannot update a deleted member',
  'File too large. Maximum size is 5MB.',
  'Forbidden',
  'Internal server error',
  'Invalid Ethiopian date format',
  'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
  'Invalid payment date format',
  'Invalid start date format',
  'Member already has an active subscription for this service',
  'Member is already deleted',
  'Member is not deleted',
  'Member not found',
  'No photo provided',
  'Payment is already voided',
  'Payment not found',
  'Service is already inactive',
  'Service is not active',
  'Service not found',
  'Storage not configured',
  'Subscription not found',
  'Unauthorized',
  'Unknown cleanup action',
  'User is already deactivated',
  'User not found',
  'You cannot deactivate yourself',
];

export function sanitizeError(
  err: unknown,
  locale: string,
  enFallback: string,
  amFallback: string
): string {
  if (err instanceof Error && SAFE_ERROR_MESSAGES.includes(err.message)) {
    return err.message;
  }
  return locale === 'am' ? amFallback : enFallback;
}
