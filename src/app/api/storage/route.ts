import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { countDocs, getDocs } from '@/lib/db';
import { adminBucket } from '@/lib/firebase-admin';
import {
  DEFAULT_STALE_MONTHS,
  findStaleMembers,
  purgeDeletedMembers,
  purgeDeletedMemberPhotos,
  purgeOrphanedFiles,
} from '@/services/storage.service';

const COLLECTIONS = ['members', 'subscriptions', 'payments', 'services', 'users'] as const;

async function estimateCollectionSize(name: string): Promise<{ count: number; estimatedBytes: number }> {
  const count = await countDocs(name);
  if (count === 0) return { count: 0, estimatedBytes: 0 };

  const sample = await getDocs<Record<string, unknown>>(name, undefined, undefined, 10);
  const avgSize =
    sample.reduce((sum, doc) => sum + JSON.stringify(doc).length, 0) / sample.length;
  return { count, estimatedBytes: Math.round(count * avgSize) };
}

async function getStorageUsage() {
  if (!adminBucket) return { files: 0, bytes: 0, filesByPrefix: [] as { prefix: string; count: number; bytes: number }[] };

  const [files] = await adminBucket.getFiles();
  const prefixMap = new Map<string, { count: number; bytes: number }>();
  let totalBytes = 0;

  // Metadata calls are one HTTP round-trip per file — run them in parallel
  // instead of serially.
  const sizes = await Promise.all(
    files.map(async (file) => {
      try {
        const [metadata] = await file.getMetadata();
        return Number(metadata.size) || 0;
      } catch {
        return 0;
      }
    }),
  );

  files.forEach((file, i) => {
    totalBytes += sizes[i];
    const parts = file.name.split('/');
    const prefix = parts.length > 1 ? parts[0] : '(root)';
    const entry = prefixMap.get(prefix) || { count: 0, bytes: 0 };
    entry.count++;
    entry.bytes += sizes[i];
    prefixMap.set(prefix, entry);
  });

  return {
    files: files.length,
    bytes: totalBytes,
    filesByPrefix: Array.from(prefixMap.entries()).map(([prefix, data]) => ({
      prefix,
      ...data,
    })),
  };
}

const KB = 1024;
const MB = KB * KB;
const GB = MB * KB;

const FIRESTORE_FREE_LIMIT = 1 * GB;
const STORAGE_FREE_LIMIT = 5 * GB;

export const GET = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);

  const staleMonthsParam = Number(request.nextUrl.searchParams.get('staleMonths'));
  const staleMonths = Number.isInteger(staleMonthsParam) && staleMonthsParam >= 1
    ? staleMonthsParam
    : DEFAULT_STALE_MONTHS;

  const [collectionStats, storageUsage, staleMembers] = await Promise.all([
    Promise.all(COLLECTIONS.map(estimateCollectionSize)),
    getStorageUsage(),
    findStaleMembers(staleMonths),
  ]);
  const totalDbBytes = collectionStats.reduce((s, c) => s + c.estimatedBytes, 0);

  return apiResponse({
    firestore: {
      collections: collectionStats.map((c, i) => ({
        name: COLLECTIONS[i],
        ...c,
      })),
      totalBytes: totalDbBytes,
      freeLimit: FIRESTORE_FREE_LIMIT,
      usedPercent: Math.min(100, Math.round((totalDbBytes / FIRESTORE_FREE_LIMIT) * 100)),
    },
    storage: {
      ...storageUsage,
      freeLimit: STORAGE_FREE_LIMIT,
      usedPercent: Math.min(100, Math.round((storageUsage.bytes / STORAGE_FREE_LIMIT) * 100)),
    },
    staleMonths,
    staleMembers,
  });
});

// DELETE — cleanup actions (all irreversible)
export const DELETE = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner'], request);
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');

  if (action === 'purge-orphaned-files') {
    if (!adminBucket) return apiError('Storage not configured', 500);
    const deleted = await purgeOrphanedFiles(adminBucket);
    return apiResponse({ message: `Deleted ${deleted} orphaned file(s)` });
  }

  if (action === 'purge-deleted-member-photos') {
    if (!adminBucket) return apiError('Storage not configured', 500);
    const deleted = await purgeDeletedMemberPhotos(adminBucket);
    return apiResponse({ message: `Deleted ${deleted} file(s) from soft-deleted members` });
  }

  if (action === 'purge-deleted-members') {
    if (!adminBucket) return apiError('Storage not configured', 500);
    const photosDeleted = await purgeDeletedMemberPhotos(adminBucket);
    const { members, payments, subscriptions } = await purgeDeletedMembers();
    return apiResponse({
      message: `Permanently deleted ${members} member(s), ${subscriptions} subscription(s), ${payments} payment(s) and ${photosDeleted} photo(s)`,
    });
  }

  return apiError('Unknown cleanup action', 400);
});
