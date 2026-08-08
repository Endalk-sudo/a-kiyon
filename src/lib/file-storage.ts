import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Abstraction over member-photo storage. Backblaze B2 (S3-compatible,
 * ~$6/TB/mo, 10 GB free) is the only storage backend — no Firebase
 * Storage, no other providers.
 *
 * The bucket stays PRIVATE: save() returns the canonical relative path
 * (`uploads/<uuid>.webp`), which is what gets stored on member docs, and
 * getUrl() issues short-lived presigned read URLs at render time.
 */

export const PHOTO_URL_TTL_SECONDS = 3600;

export interface StoredFile {
  url: string;
  pathname: string;
}

export interface FileStore {
  save(pathname: string, body: Buffer, contentType: string): Promise<StoredFile>;
  getUrl(pathname: string, expiresInSeconds?: number): Promise<string>;
  list(prefix?: string): Promise<{ pathname: string; size: number }[]>;
  delete(pathname: string): Promise<void>;
}

export interface B2Config {
  bucket: string;
  region: string;
  applicationKeyId: string;
  applicationKey: string;
  s3Endpoint?: string;
}

/**
 * Accept either the bare Backblaze region ("us-east-005") or the full S3
 * endpoint URL shown in the B2 console ("https://s3.us-east-005.
 * backblazeb2.com"); returns the bare region in both cases.
 */
export function normalizeB2Region(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\/+$/, '');
  const match = trimmed.match(/s3\.([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.backblazeb2\.com$/i);
  return match ? match[1] : trimmed;
}

export function b2FileStore(config: B2Config): FileStore {
  const s3Endpoint =
    config.s3Endpoint ?? `https://s3.${config.region}.backblazeb2.com`;
  const client = new S3Client({
    region: config.region,
    endpoint: s3Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.applicationKeyId,
      secretAccessKey: config.applicationKey,
    },
  });

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
      // Canonical relative path — never stored as an expiring or public URL.
      return { url: pathname, pathname };
    },
    async getUrl(pathname, expiresInSeconds = PHOTO_URL_TTL_SECONDS) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: pathname }),
        { expiresIn: expiresInSeconds },
      );
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

function b2FileStoreFromEnv(): FileStore | null {
  const missing = B2_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) return null;
  return b2FileStore({
    bucket: process.env.B2_BUCKET!,
    region: normalizeB2Region(process.env.B2_REGION)!,
    applicationKeyId: process.env.B2_APPLICATION_KEY_ID!,
    applicationKey: process.env.B2_APPLICATION_KEY!,
    s3Endpoint: process.env.B2_S3_ENDPOINT || undefined,
  });
}

/**
 * Non-throwing variant for read paths (e.g. photo-URL signing in service
 * mappers): returns null when B2 isn't configured so callers can degrade
 * gracefully instead of failing member list/get requests.
 */
export function getFileStoreSafe(): FileStore | null {
  return b2FileStoreFromEnv();
}

/**
 * The active Backblaze B2 store. Fails fast when required B2 env vars are
 * missing (also in local dev; there is no other storage backend).
 */
export function getFileStore(): FileStore {
  const store = b2FileStoreFromEnv();
  if (!store) {
    const missing = B2_ENV_VARS.filter((name) => !process.env[name]);
    console.error(`[storage] Missing B2 configuration: ${missing.join(', ')}`);
    throw new Error('Storage not configured');
  }
  return store;
}