import { describe, it, expect, vi } from 'vitest';
import { apiHandler } from '@/lib/api-handler';
import { SAFE_ERROR_MESSAGES } from '@/lib/errors';
import { z } from 'zod';

async function run(handler: (...args: never[]) => Promise<Response>) {
  const wrapped = apiHandler(handler);
  return wrapped();
}

describe('apiHandler error mapping', () => {
  it('returns 400 with formatted issues for ZodError', async () => {
    const res = await run(async () => {
      z.object({ name: z.string().min(1) }).parse({ name: '' });
      throw new Error('unreachable');
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('name');
  });

  it('returns 401 when the handler throws Unauthorized', async () => {
    const res = await run(async () => {
      throw new Error('Unauthorized');
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 403 when the handler throws Forbidden', async () => {
    const res = await run(async () => {
      throw new Error('Forbidden');
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await run(async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON body');
  });

  it('returns 500 with the safe message for known operational errors', async () => {
    const res = await run(async () => {
      throw new Error(SAFE_ERROR_MESSAGES[0]);
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(SAFE_ERROR_MESSAGES[0]);
  });

  it('returns a generic 500 without leaking internals for unexpected errors', async () => {
    const error = new Error('secret DB password=abc123 leaked in error message');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run(async () => {
      throw error;
    });
    spy.mockRestore();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(body.error).not.toContain('password');
  });

  it('passes through successful responses untouched', async () => {
    const res = await run(async () => Response.json({ ok: true }, { status: 201 }));
    expect(res.status).toBe(201);
    expect((await res.json()).ok).toBe(true);
  });
});
