import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
}

// Server-side allowlist mirroring src/lib/errors.ts — unexpected errors are
// returned as a generic message so internals are never leaked to the client.
const SAFE_ERROR_MESSAGES = new Set([
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
]);

export function apiHandler<T extends (...args: never[]) => Promise<Response>>(handler: T): T {
  return (async (...args: never[]) => {
    try {
      return await handler(...args);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: formatZodError(error) },
          { status: 400 }
        );
      }
      if (error instanceof SyntaxError && /JSON|Unexpected end|parse/i.test(error.message)) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const safeMessage = SAFE_ERROR_MESSAGES.has(message) ? message : 'Internal server error';
      return NextResponse.json({ error: safeMessage }, { status: 500 });
    }
  }) as T;
}
