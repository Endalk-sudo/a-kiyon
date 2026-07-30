import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
}
export function apiHandler<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
  return (async (...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: formatZodError(error) },
          { status: 400 }
        );
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }) as T;
}
