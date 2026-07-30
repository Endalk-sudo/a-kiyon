import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { db, countDocs, getDocs } from '@/lib/db';
import { adminBucket } from '@/lib/firebase-admin';

const COLLECTIONS = ['members', 'subscriptions', 'payments', 'services', 'users', 'auditLogs'] as const;

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

  for (const file of files) {
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size) || 0;
    totalBytes += size;

    const parts = file.name.split('/');
    const prefix = parts.length > 1 ? parts[0] : '(root)';
    const entry = prefixMap.get(prefix) || { count: 0, bytes: 0 };
    entry.count++;
    entry.bytes += size;
    prefixMap.set(prefix, entry);
  }

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

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${bytes} B`;
}

const FIRESTORE_FREE_LIMIT = 1 * GB;
const STORAGE_FREE_LIMIT = 5 * GB;

export const GET = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner'], request);

  const collectionStats = await Promise.all(COLLECTIONS.map(estimateCollectionSize));
  const totalDbBytes = collectionStats.reduce((s, c) => s + c.estimatedBytes, 0);

  const storageUsage = await getStorageUsage();

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
    formatBytes,
  });
});

// DELETE — cleanup actions
export const DELETE = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner'], request);
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');

  if (action === 'purge-orphaned-files') {
    if (!adminBucket) return apiError('Storage not configured', 500);
    const [files] = await adminBucket.getFiles({ autoPaginate: true });
    let deleted = 0;
    for (const file of files) {
      const match = file.name.match(/uploads\/(?:thumbs\/)?([^/]+)-/);
      if (match) {
        const memberId = match[1];
        const member = await db.collection('members').doc(memberId).get();
        if (!member.exists) {
          await file.delete();
          deleted++;
        }
      }
    }
    return apiResponse({ message: `Deleted ${deleted} orphaned file(s)` });
  }

  if (action === 'purge-old-audit-logs') {
    const daysStr = searchParams.get('days') || '90';
    const days = parseInt(daysStr, 10);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const oldLogs = await getDocs<Record<string, unknown>>('auditLogs', [['createdAt', '<', cutoff]]);
    const batch = db.batch();
    oldLogs.forEach((log) => batch.delete(db.collection('auditLogs').doc(log.id)));
    await batch.commit();
    return apiResponse({ message: `Deleted ${oldLogs.length} audit log(s) older than ${days} days` });
  }

  if (action === 'purge-deleted-members') {
    const deletedMembers = await getDocs<Record<string, unknown>>('members', [['isDeleted', '==', true]]);
    const batch = db.batch();
    deletedMembers.forEach((m) => batch.delete(db.collection('members').doc(m.id)));
    await batch.commit();
    return apiResponse({ message: `Permanently deleted ${deletedMembers.length} member(s)` });
  }

  return apiError('Unknown cleanup action', 400);
});
