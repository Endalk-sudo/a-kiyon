import { getDocs, batchDelete } from '@/lib/db';
import { adminBucket } from '@/lib/firebase-admin';

export interface StaleMember {
  id: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  lastPaymentDate: string | null;
}

type StorageBucket = NonNullable<typeof adminBucket>;

export const DEFAULT_STALE_MONTHS = 6;

export function monthsAgoIso(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString();
}

/**
 * Extract the bucket path (e.g. `uploads/<uuid>.webp`) from a photo URL.
 * Handles emulator URLs (`.../o/uploads%2F<uuid>.webp?alt=media`), signed
 * URLs (`https://storage.googleapis.com/<bucket>/uploads%2F<uuid>.webp?...`)
 * and raw stored paths. Returns null when no `uploads/` path is present.
 */
export function photoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const decoded = decodeURIComponent(url);
    const withoutQuery = decoded.split('?')[0];
    const marker = withoutQuery.indexOf('/o/');
    if (marker !== -1) {
      const path = withoutQuery.slice(marker + 3);
      return path || null;
    }
    const match = withoutQuery.match(/uploads\/[^?#]+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

export function thumbPathFromPhotoPath(photoPath: string | null): string | null {
  if (!photoPath) return null;
  const match = photoPath.match(/^uploads\/(.+)\.webp$/);
  if (!match) return null;
  return `uploads/thumbs/${match[1]}-thumb.webp`;
}

/**
 * Members who have not paid in `months` months (or never paid).
 * Non-deleted members whose most recent non-voided payment predates the
 * cutoff are stale; members with no payments at all are always stale.
 */
export async function findStaleMembers(months = DEFAULT_STALE_MONTHS): Promise<StaleMember[]> {
  const cutoff = monthsAgoIso(months);

  const members = await getDocs<{
    firstName: string;
    lastName: string;
    photo?: string | null;
    isDeleted: boolean;
  }>('members', [['isDeleted', '==', false]]);

  // Everyone with a recent non-voided payment is definitely NOT stale —
  // one bounded query on the existing isVoided + paymentDate index.
  const recentPayments = await getDocs<{ memberId: string }>('payments', [
    ['isVoided', '==', false],
    ['paymentDate', '>=', cutoff],
  ]);
  const recentPayerIds = new Set(recentPayments.map((p) => p.memberId));

  // Only members outside that set need their history checked.
  const candidates = members.filter((m) => !recentPayerIds.has(m.id));

  const stale: StaleMember[] = [];
  for (const member of candidates) {
    const payments = await getDocs<{ paymentDate: string; isVoided: boolean }>(
      'payments',
      [['memberId', '==', member.id]],
      ['paymentDate', 'desc'],
      10,
    );
    const last = payments.find((p) => !p.isVoided);
    if (last && last.paymentDate >= cutoff) continue;
    stale.push({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      photo: member.photo ?? null,
      lastPaymentDate: last ? last.paymentDate : null,
    });
  }

  return stale;
}

/**
 * Delete upload files (and thumbnails) that no member document references.
 * Reference-based: every `uploads/` file not present in any member's photo
 * URL is an orphan. Thumbnails are never referenced and always qualify.
 */
export async function purgeOrphanedFiles(bucket: StorageBucket): Promise<number> {
  const [files] = await bucket.getFiles({ autoPaginate: true, prefix: 'uploads/' });

  const members = await getDocs<{ photo?: string | null }>('members');
  const referenced = new Set<string>();
  for (const member of members) {
    const path = photoPathFromUrl(member.photo);
    if (!path) continue;
    referenced.add(path);
    const thumb = thumbPathFromPhotoPath(path);
    if (thumb) referenced.add(thumb);
  }

  let deleted = 0;
  for (const file of files) {
    if (referenced.has(file.name)) continue;
    await file.delete();
    deleted++;
  }
  return deleted;
}

/**
 * Delete photos (and thumbnails) of members that were soft-deleted.
 * Irreversible — only owner-triggered.
 */
export async function purgeDeletedMemberPhotos(bucket: StorageBucket): Promise<number> {
  const deletedMembers = await getDocs<{ photo?: string | null }>('members', [['isDeleted', '==', true]]);

  let deleted = 0;
  for (const member of deletedMembers) {
    const path = photoPathFromUrl(member.photo);
    if (!path) continue;
    const targets = [path, thumbPathFromPhotoPath(path)].filter(Boolean) as string[];
    for (const target of targets) {
      const file = bucket.file(target);
      const [exists] = await file.exists();
      if (!exists) continue;
      await file.delete();
      deleted++;
    }
  }
  return deleted;
}

/**
 * Permanently delete soft-deleted member documents, chunked into batches
 * under Firestore's 500-write limit. Photos are handled separately.
 */
export async function purgeDeletedMembers(): Promise<number> {
  const deletedMembers = await getDocs<Record<string, unknown>>('members', [['isDeleted', '==', true]]);
  if (deletedMembers.length === 0) return 0;
  return batchDelete('members', deletedMembers.map((m) => m.id));
}
