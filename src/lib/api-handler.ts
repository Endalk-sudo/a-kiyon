import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { SAFE_ERROR_MESSAGES } from '@/lib/errors';

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
}

const SAFE_ERROR_SET = new Set<string>(SAFE_ERROR_MESSAGES);

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
      if (SAFE_ERROR_SET.has(message)) {
        return NextResponse.json({ error: message }, { status: 500 });
      }
      // Unexpected error: log the real cause for operators, return a generic
      // message so internals never leak to the client.
      console.error('[api] unhandled error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }) as T;
}
