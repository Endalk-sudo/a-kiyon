import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { adminBucket } from '@/lib/firebase-admin';

type Bucket = NonNullable<typeof adminBucket>;

async function publicUrl(bucket: Bucket, filePath: string) {
  const file = bucket.file(filePath);
  if (process.env.FIREBASE_EMULATOR === 'true') {
    return `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
  }
  const [url] = await file.getSignedUrl({
    action: 'read',
    // 1 year — URLs are unauthenticated once issued, so long-lived links
    // (previously ~25 years) were a leak risk if ever shared.
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
  return url;
}

export const POST = apiHandler(async (request: NextRequest) => {
  await getSessionOrThrow(['owner', 'manager'], request);

  const formData = await request.formData();
  const file = formData.get('photo') as File | null;

  if (!file) return apiError('No photo provided', 400);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return apiError('Invalid file type. Only JPEG, PNG, and WebP are allowed.', 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    return apiError('File too large. Maximum size is 5MB.', 400);
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Decompression-bomb guard: verify real dimensions and an upper bound on
  // pixels BEFORE sharp decodes (a small PNG can decompress to a huge
  // bitmap, turning an authenticated request into a memory DoS).
  let image = sharp(buffer);
  try {
    const metadata = await image.metadata();
    const { width, height } = metadata;
    if (!width || !height || width * height > 24_000_000) {
      return apiError('Image too large. Maximum dimensions are 6000x4000.', 400);
    }
  } catch {
    return apiError('Invalid image file', 400);
  }

  const uuid = randomUUID();
  const filename = `${uuid}.webp`;
  const thumbFilename = `${uuid}-thumb.webp`;

  image = sharp(buffer).webp({ quality: 80 });

  const fullBuffer = await image.clone().toBuffer();
  const thumbBuffer = await image.clone().resize(200, 200, { fit: 'cover' }).toBuffer();

  const bucket = adminBucket;
  if (!bucket) return apiError('Storage not configured', 500);

  const filePath = `uploads/${filename}`;
  const thumbPath = `uploads/thumbs/${thumbFilename}`;

  try {
    await bucket.file(filePath).save(fullBuffer, {
      contentType: 'image/webp',
    });

    await bucket.file(thumbPath).save(thumbBuffer, {
      contentType: 'image/webp',
    });

    const photoUrl = await publicUrl(bucket, filePath);
    const thumbnailUrl = await publicUrl(bucket, thumbPath);

    return apiResponse({ url: photoUrl, thumbnailUrl });
  } catch (err) {
    // Don't leave orphans behind if a later step fails.
    await Promise.allSettled([
      bucket.file(filePath).delete(),
      bucket.file(thumbPath).delete(),
    ]);
    throw err;
  }
});
