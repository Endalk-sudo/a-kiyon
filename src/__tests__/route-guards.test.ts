import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  getSessionOrThrow: vi.fn(),
}));

describe('Route permission guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/services', () => {
    it('rejects unauthenticated requests with 401', async () => {
      (getSessionOrThrow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

      const { GET } = await import('@/app/api/services/route');
      const res = await GET(new NextRequest('http://localhost:3000/api/services'));

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Unauthorized');
      expect(getSessionOrThrow).toHaveBeenCalledTimes(1);
    });

    it('rejects forbidden roles with 403', async () => {
      (getSessionOrThrow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Forbidden'));

      const { GET } = await import('@/app/api/services/route');
      const res = await GET(new NextRequest('http://localhost:3000/api/services'));

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Forbidden');
    });
  });

  describe('GET /api/export/payments', () => {
    it('rejects unauthenticated requests with 401 before touching data', async () => {
      (getSessionOrThrow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

      const { GET } = await import('@/app/api/export/payments/route');
      const res = await GET(new NextRequest('http://localhost:3000/api/export/payments'));

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Unauthorized');
    });
  });

  describe('GET /api/storage', () => {
    it('rejects reader role with 401 (owner-only route)', async () => {
      (getSessionOrThrow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

      const { GET } = await import('@/app/api/storage/route');
      const res = await GET(new NextRequest('http://localhost:3000/api/storage'));

      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('Unauthorized');
    });
  });
});
