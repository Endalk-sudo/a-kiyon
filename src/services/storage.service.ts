import { getDocs, batchDelete, chunk } from '@/lib/db';
import { adminBucket } from '@/lib/firebase-admin';

export interface StaleMember {
  id: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  photoThumb?: string | null;
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
    photoThumb?: string | null;
    isDeleted: boolean;
  }>('members', [['isDeleted', '==', false]]);

  // Everyone with a recent non-voided payment is definitely NOT stale —
  // one bounded query on the existing isVoided + paymentDate index.
  const recentPayments = await getDocs<{ memberId: string }>('payments', [
    ['isVoided', '==', false],
    ['paymentDate', '>=', cutoff],
  ]);
  const recentPayerIds = new Set(recentPayments.map((p) => p.memberId));

  // Every remaining member is stale by definition (they have no non-voided
  // payment >= cutoff). Their lastPaymentDate is fetched for display with
  // chunked `in` queries (Firestore caps `in` at 30 values) instead of one
  // query per member — the previous N+1.
  const candidates = members.filter((m) => !recentPayerIds.has(m.id));

  const latestPaymentByMember = new Map<string, string | null>();
  for (const idChunk of chunk(candidates.map((m) => m.id))) {
    const payments = await getDocs<{ memberId: string; paymentDate: string; isVoided: boolean }>(
      'payments',
      [['memberId', 'in', idChunk]],
      ['paymentDate', 'desc'],
      idChunk.length * 20,
    );
    const seen = new Set<string>();
    for (const p of payments) {
      if (p.isVoided || seen.has(p.memberId)) continue;
      seen.add(p.memberId);
      latestPaymentByMember.set(p.memberId, p.paymentDate);
    }
  }

  return candidates.map((member) => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    photo: member.photo ?? null,
    photoThumb: member.photoThumb ?? null,
    lastPaymentDate: latestPaymentByMember.get(member.id) ?? null,
  }));
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
  for (const chunkOfFiles of chunk(files.map((f) => f.name))) {
    const results = await Promise.allSettled(
      chunkOfFiles
        .filter((name) => !referenced.has(name))
        .map((name) => bucket.file(name).delete()),
    );
    deleted += results.filter((r) => r.status === 'fulfilled').length;
  }
  return deleted;
}

/**
 * Delete photos (and thumbnails) of members that were soft-deleted.
 * Irreversible — only owner-triggered.
 */
export async function purgeDeletedMemberPhotos(bucket: StorageBucket): Promise<number> {
  const deletedMembers = await getDocs<{ photo?: string | null }>('members', [['isDeleted', '==', true]]);

  const targets: string[] = [];
  for (const member of deletedMembers) {
    const path = photoPathFromUrl(member.photo);
    if (!path) continue;
    targets.push(path, ...(thumbPathFromPhotoPath(path) ? [thumbPathFromPhotoPath(path) as string] : []));
  }

  let deleted = 0;
  for (const targetChunk of chunk(targets)) {
    const results = await Promise.allSettled(
      targetChunk.map(async (target) => {
        const file = bucket.file(target);
        const [exists] = await file.exists();
        if (!exists) return false;
        await file.delete();
        return true;
      }),
    );
    deleted += results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
  }
  return deleted;
}

/**
 * Permanently delete soft-deleted member documents AND their orphaned
 * subscriptions/payments, chunked into batches under Firestore's 500-write
 * limit. Photos are handled separately.
 */
export async function purgeDeletedMembers(): Promise<{
  members: number;
  payments: number;
  subscriptions: number;
}> {
  const deletedMembers = await getDocs<Record<string, unknown>>('members', [['isDeleted', '==', true]]);
  if (deletedMembers.length === 0) return { members: 0, payments: 0, subscriptions: 0 };

  const memberIds = deletedMembers.map((m) => m.id);

  const paymentIds: string[] = [];
  const subscriptionIds: string[] = [];
  for (const idChunk of chunk(memberIds)) {
    const [payments, subscriptions] = await Promise.all([
      getDocs<Record<string, unknown>>('payments', [['memberId', 'in', idChunk]]),
      getDocs<Record<string, unknown>>('subscriptions', [['memberId', 'in', idChunk]]),
    ]);
    paymentIds.push(...payments.map((p) => p.id));
    subscriptionIds.push(...subscriptions.map((s) => s.id));
  }

  const [deletedPayments, deletedSubscriptions, deletedMembersCount] = await Promise.all([
    batchDelete('payments', paymentIds),
    batchDelete('subscriptions', subscriptionIds),
    batchDelete('members', memberIds),
  ]);

  return { members: deletedMembersCount, payments: deletedPayments, subscriptions: deletedSubscriptions };
}
