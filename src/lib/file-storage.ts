import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { adminBucket } from '@/lib/firebase-admin';

/**
 * Abstraction over member-photo storage. Production stores files in
 * Backblaze B2 (S3-compatible, ~$6/TB/mo, 10 GB free) via the AWS SDK v3;
 * local development keeps using the Firebase Storage emulator.
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

export interface B2Config {
  bucket: string;
  region: string;
  applicationKeyId: string;
  applicationKey: string;
  s3Endpoint?: string;
  publicUrl?: string;
}

export function b2FileStore(config: B2Config): FileStore {
  const s3Endpoint =
    config.s3Endpoint ?? `https://s3.${config.region}.backblazeb2.com`;
  // Public read access works at the bucket-prefixed path on B2; override
  // with a custom domain via publicUrl if one is added later.
  const publicBase = config.publicUrl ?? `${s3Endpoint}/${config.bucket}`;
  const client = new S3Client({
    region: config.region,
    endpoint: s3Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.applicationKeyId,
      secretAccessKey: config.applicationKey,
    },
  });

  const photoUrl = (pathname: string) => `${publicBase}/${pathname}`;

  return {
    async save(pathname, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: pathname,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { url: photoUrl(pathname), pathname };
    },
    async list(prefix) {
      const files: { pathname: string; size: number }[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of page.Contents ?? []) {
          files.push({ pathname: obj.Key ?? '', size: obj.Size ?? 0 });
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return files;
    },
    async delete(pathname) {
      // S3 DeleteObject is idempotent — deleting a missing object is a no-op.
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: pathname }),
      );
    },
  };
}

const B2_ENV_VARS = [
  'B2_BUCKET',
  'B2_REGION',
  'B2_APPLICATION_KEY_ID',
  'B2_APPLICATION_KEY',
] as const;

/**
 * Select the active file store. Emulator mode (and tests) always use the
 * Firebase Storage emulator; production requires B2 credentials. Returns
 * null when no backend is configured (routes surface a clean 500).
 */
export function getFileStore(): FileStore | null {
  if (process.env.FIREBASE_EMULATOR === 'true') {
    return adminBucket ? firebaseFileStore(adminBucket) : null;
  }
  const missing = B2_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) return null;
  return b2FileStore({
    bucket: process.env.B2_BUCKET!,
    region: process.env.B2_REGION!,
    applicationKeyId: process.env.B2_APPLICATION_KEY_ID!,
    applicationKey: process.env.B2_APPLICATION_KEY!,
    s3Endpoint: process.env.B2_S3_ENDPOINT || undefined,
    publicUrl: process.env.B2_PUBLIC_URL || undefined,
  });
}
