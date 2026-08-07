import { put, list as listBlobs, del as deleteBlob } from '@vercel/blob';
import { adminBucket } from '@/lib/firebase-admin';

/**
 * Abstraction over member-photo storage. Production uses Vercel Blob (free
 * tier — Firebase Storage requires the paid Blaze plan); local development
 * keeps using the Firebase Storage emulator.
 */

export interface StoredFile {
  url: string;
  pathname: string;
}

export interface FileStore {
  save(pathname: string, body: Buffer, contentType: string): Promise<StoredFile>;
  list(prefix?: string): Promise<{ pathname: string; size: number }[]>;
  delete(pathname: string): Promise<void>;
}

type Bucket = NonNullable<typeof adminBucket>;

export function firebaseFileStore(bucket: Bucket): FileStore {
  return {
    async save(pathname, body, contentType) {
      await bucket.file(pathname).save(body, { contentType });
      const url =
        process.env.FIREBASE_EMULATOR === 'true'
          ? `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(pathname)}?alt=media`
          : (
              await bucket.file(pathname).getSignedUrl({
                action: 'read',
                // 1 year — URLs are unauthenticated once issued, so
                // long-lived links were a leak risk if ever shared.
                expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              })
            )[0];
      return { url, pathname };
    },
    async list(prefix) {
      const [files] = await bucket.getFiles({ autoPaginate: true, prefix });
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
      return files.map((file, i) => ({ pathname: file.name, size: sizes[i] }));
    },
    async delete(pathname) {
      const file = bucket.file(pathname);
      const [exists] = await file.exists();
      if (exists) await file.delete();
    },
  };
}

export function blobFileStore(): FileStore {
  return {
    async save(pathname, body, contentType) {
      const result = await put(pathname, body, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
      });
      return { url: result.url, pathname: result.pathname };
    },
    async list(prefix) {
      const files: { pathname: string; size: number }[] = [];
      let cursor: string | undefined;
      do {
        const page = await listBlobs({ prefix, cursor, limit: 1000 });
        for (const blob of page.blobs) files.push({ pathname: blob.pathname, size: blob.size });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return files;
    },
    async delete(pathname) {
      // del() is idempotent — deleting a missing blob is a no-op.
      await deleteBlob(pathname);
    },
  };
}

/**
 * Select the active file store. Emulator mode (and tests) always use the
 * Firebase Storage emulator; production requires BLOB_READ_WRITE_TOKEN.
 * Returns null when no backend is configured.
 */
export function getFileStore(): FileStore | null {
  if (process.env.FIREBASE_EMULATOR === 'true') {
    return adminBucket ? firebaseFileStore(adminBucket) : null;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobFileStore();
  return null;
}
