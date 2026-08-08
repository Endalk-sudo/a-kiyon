import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import type { FileStore } from '@/lib/file-storage';
import {
  findStaleMembers,
  monthsAgoIso,
  photoPathFromUrl,
  purgeDeletedMemberPhotos,
  purgeDeletedMembers,
  purgeOrphanedFiles,
  thumbPathFromPhotoPath,
} from '@/services/storage.service';

const TEST_PREFIX = 'test_stale_';

async function cleanup() {
  const members = await db
    .collection('members')
    .where('firstName', '>=', TEST_PREFIX)
    .get();
  const memberIds = members.docs.map((d) => d.id);
  const payments = await db.collection('payments').where('memberId', 'in', memberIds.length ? memberIds : ['__none__']).get();

  const batch = db.batch();
  members.docs.forEach((d) => batch.delete(d.ref));
  payments.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function seedMember(name: string, daysAgo: number | null): Promise<string> {
  const ref = await db.collection('members').add({
    firstName: `${TEST_PREFIX}${name}`,
    lastName: 'Test',
    phone: `+251911${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
    isDeleted: false,
    createdAt: isoDaysAgo(daysAgo ?? 365),
    updatedAt: isoDaysAgo(daysAgo ?? 365),
  });

  if (daysAgo !== null) {
    await db.collection('payments').add({
      memberId: ref.id,
      subscriptionId: 'none',
      amount: 500,
      method: 'cash',
      paymentDate: isoDaysAgo(daysAgo),
      isVoided: false,
      createdAt: isoDaysAgo(daysAgo),
      updatedAt: isoDaysAgo(daysAgo),
    });
  }
  return ref.id;
}

describe('Storage Service (integration)', () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('photoPathFromUrl', () => {
    it('parses emulator URLs', () => {
      expect(
        photoPathFromUrl(
          'http://127.0.0.1:9199/v0/b/a-kiyon.appspot.com/o/uploads%2Fabc-123.webp?alt=media',
        ),
      ).toBe('uploads/abc-123.webp');
    });

    it('parses signed storage.googleapis.com URLs', () => {
      expect(
        photoPathFromUrl(
          'https://storage.googleapis.com/a-kiyon.appspot.com/uploads%2Fabc-123.webp?GoogleAccessId=x%40x.iam.gserviceaccount.com&Expires=2524608000&Signature=xyz',
        ),
      ).toBe('uploads/abc-123.webp');
    });

    it('parses raw stored paths', () => {
      expect(photoPathFromUrl('uploads/abc-123.webp')).toBe('uploads/abc-123.webp');
    });

    it('parses Vercel Blob URLs', () => {
      expect(
        photoPathFromUrl('https://abcd1234.public.blob.vercel-storage.com/uploads/abc-123.webp'),
      ).toBe('uploads/abc-123.webp');
      expect(
        photoPathFromUrl(
          'https://abcd1234.public.blob.vercel-storage.com/uploads/abc-123.webp?download=1',
        ),
      ).toBe('uploads/abc-123.webp');
    });

    it('returns null for empty or invalid input', () => {
      expect(photoPathFromUrl(null)).toBeNull();
      expect(photoPathFromUrl(undefined)).toBeNull();
      expect(photoPathFromUrl('')).toBeNull();
      expect(photoPathFromUrl('https://example.com/photo.jpg')).toBeNull();
    });
  });

  describe('thumbPathFromPhotoPath', () => {
    it('derives the thumbnail path', () => {
      expect(thumbPathFromPhotoPath('uploads/abc-123.webp')).toBe(
        'uploads/thumbs/abc-123-thumb.webp',
      );
    });

    it('returns null for non-uploads paths', () => {
      expect(thumbPathFromPhotoPath(null)).toBeNull();
      expect(thumbPathFromPhotoPath('other/foo.png')).toBeNull();
    });
  });

  describe('findStaleMembers', () => {
    it('flags members who never paid and those whose last payment is old', async () => {
      const recent = await seedMember('Recent', 10);
      const old = await seedMember('Old', 200);
      const never = await seedMember('Never', null);
      const voidedOnly = await seedMember('VoidedOnly', 200);
      await db
        .collection('payments')
        .add({
          memberId: voidedOnly,
          subscriptionId: 'none',
          amount: 500,
          method: 'cash',
          paymentDate: isoDaysAgo(200),
          isVoided: true,
          createdAt: isoDaysAgo(200),
          updatedAt: isoDaysAgo(200),
        });

      const stale = await findStaleMembers(6);
      const staleIds = new Set(stale.map((m) => m.id));

      expect(staleIds.has(old)).toBe(true);
      expect(staleIds.has(never)).toBe(true);
      expect(staleIds.has(voidedOnly)).toBe(true);
      expect(staleIds.has(recent)).toBe(false);

      const neverEntry = stale.find((m) => m.id === never);
      expect(neverEntry?.lastPaymentDate).toBeNull();
    });

    it('respects a custom cutoff', async () => {
      const paid200 = await seedMember('Paid200', 200);

      const stale3 = await findStaleMembers(3);
      const stale3Ids = new Set(stale3.map((m) => m.id));
      expect(stale3Ids.has(paid200)).toBe(true);

      const stale12 = await findStaleMembers(12);
      const stale12Ids = new Set(stale12.map((m) => m.id));
      expect(stale12Ids.has(paid200)).toBe(false);
    });

    it('excludes soft-deleted members', async () => {
      const deleted = await seedMember('Deleted', 300);
      await db.collection('members').doc(deleted).update({ isDeleted: true });

      const stale = await findStaleMembers(6);
      expect(stale.some((m) => m.id === deleted)).toBe(false);
    });
  });

  describe('monthsAgoIso', () => {
    it('returns an ISO string roughly N months back', () => {
      const cutoff = monthsAgoIso(6);
      const diffMs = Date.now() - new Date(cutoff).getTime();
      const diffMonths = diffMs / (30 * 24 * 60 * 60 * 1000);
      expect(diffMonths).toBeGreaterThan(5);
      expect(diffMonths).toBeLessThan(7);
    });
  });

  describe('Purge functions (in-memory store)', () => {
    const files = new Map<string, Buffer>();
    const store: FileStore = {
      async save(pathname, body) {
        files.set(pathname, body);
        return { url: pathname, pathname };
      },
      async getUrl(pathname) {
        return `https://b2.test/${pathname}?signed=1`;
      },
      async list(pathname) {
        return Array.from(files.entries())
          .filter(([p]) => !pathname || p.startsWith(pathname))
          .map(([p, body]) => ({ pathname: p, size: body.byteLength }));
      },
      async delete(pathname) {
        files.delete(pathname);
      },
    };

    const TEST_FILES = [
      'uploads/ref-1.webp',
      'uploads/thumbs/ref-1-thumb.webp',
      'uploads/orphan.webp',
      'uploads/thumbs/orphan-thumb.webp',
      'uploads/ref-2.webp',
      'uploads/thumbs/ref-2-thumb.webp',
    ];

    const b2Url = (path: string) => `https://b2.test/${path}`;

    const listUploads = () => Array.from(files.keys());

    async function seedMember(name: string, photo: string | null, isDeleted: boolean) {
      await db.collection('members').add({
        firstName: `${TEST_PREFIX}${name}`,
        lastName: 'Test',
        phone: `+251911${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
        photo,
        isDeleted,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    beforeAll(async () => {
      for (const path of TEST_FILES) {
        await store.save(path, Buffer.from('test-fixture'), 'image/webp');
      }
      // Seed before the orphan purge so ref-2 stays referenced (a soft-deleted
      // member's photo is still referenced; only soft-delete cleanup removes it).
      await seedMember('PurgePhoto', b2Url('uploads/ref-2.webp'), true);
    });

    it('purgeOrphanedFiles deletes only unreferenced uploads and thumbnails', async () => {
      await seedMember('OrphanRef', b2Url('uploads/ref-1.webp'), false);

      const deleted = await purgeOrphanedFiles(store);
      expect(deleted).toBeGreaterThanOrEqual(2);

      const remaining = await listUploads();
      expect(remaining).toContain('uploads/ref-1.webp');
      expect(remaining).toContain('uploads/thumbs/ref-1-thumb.webp');
      expect(remaining).toContain('uploads/ref-2.webp');
      expect(remaining).toContain('uploads/thumbs/ref-2-thumb.webp');
      expect(remaining).not.toContain('uploads/orphan.webp');
      expect(remaining).not.toContain('uploads/thumbs/orphan-thumb.webp');
    });

    it('purgeDeletedMemberPhotos deletes photos of soft-deleted members only', async () => {
      const deleted = await purgeDeletedMemberPhotos(store);
      expect(deleted).toBeGreaterThanOrEqual(2);

      const remaining = await listUploads();
      expect(remaining).not.toContain('uploads/ref-2.webp');
      expect(remaining).not.toContain('uploads/thumbs/ref-2-thumb.webp');
      expect(remaining).toContain('uploads/ref-1.webp');
    });

    it('purgeDeletedMembers permanently deletes soft-deleted member documents only', async () => {
      const doomed = await db.collection('members').add({
        firstName: `${TEST_PREFIX}PurgeDoc`,
        lastName: 'Test',
        phone: '+2519110000097',
        isDeleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await db.collection('members').add({
        firstName: `${TEST_PREFIX}KeepDoc`,
        lastName: 'Test',
        phone: '+2519110000096',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await purgeDeletedMembers();
      expect(result.members).toBeGreaterThanOrEqual(1);

      const doomedSnap = await db.collection('members').doc(doomed.id).get();
      expect(doomedSnap.exists).toBe(false);

      const kept = await db
        .collection('members')
        .where('firstName', '==', `${TEST_PREFIX}KeepDoc`)
        .get();
      expect(kept.docs.length).toBe(1);
    });
  });
});
