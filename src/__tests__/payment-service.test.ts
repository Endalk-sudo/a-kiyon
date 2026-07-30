import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({}));

describe('Payment Service Utilities', () => {
  describe('generateReceiptNumber', () => {
    it('generates a string starting with RCPT-', async () => {
      const { generateReceiptNumber } = await import('@/services/payment.service');
      const receipt = generateReceiptNumber();
      expect(receipt).toMatch(/^RCPT-/);
    });

    it('generates unique receipt numbers', async () => {
      const { generateReceiptNumber } = await import('@/services/payment.service');
      const receipts = new Set(Array.from({ length: 100 }, () => generateReceiptNumber()));
      expect(receipts.size).toBe(100);
    });

    it('generates a string of reasonable length', async () => {
      const { generateReceiptNumber } = await import('@/services/payment.service');
      const receipt = generateReceiptNumber();
      expect(receipt.length).toBeGreaterThan(10);
      expect(receipt.length).toBeLessThan(40);
    });
  });
});
