import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { createAuditLog } from '@/lib/audit';
import { adminBucket } from '@/lib/firebase-admin';

type Bucket = NonNullable<typeof adminBucket>;

async function publicUrl(bucket: Bucket, filePath: string) {
  const file = bucket.file(filePath);
  if (process.env.FIREBASE_EMULATOR === 'true') {
    return `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
  }
  const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2050' });
  return url;
}

export const POST = apiHandler(async (request: NextRequest) => {
  const session = await getSessionOrThrow(['owner', 'manager'], request);

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

  const uuid = randomUUID();
  const filename = `${uuid}.webp`;
  const thumbFilename = `${uuid}-thumb.webp`;

  const image = sharp(buffer).webp({ quality: 80 });

  const fullBuffer = await image.clone().toBuffer();
  const thumbBuffer = await image.clone().resize(200, 200, { fit: 'cover' }).toBuffer();

  const bucket = adminBucket;
  if (!bucket) return apiError('Storage not configured', 500);

  await bucket.file(`uploads/${filename}`).save(fullBuffer, {
    contentType: 'image/webp',
  });

  await bucket.file(`uploads/thumbs/${thumbFilename}`).save(thumbBuffer, {
    contentType: 'image/webp',
  });

  const photoUrl = await publicUrl(bucket, `uploads/${filename}`);
  const thumbnailUrl = await publicUrl(bucket, `uploads/thumbs/${thumbFilename}`);

  await createAuditLog({
    userId: session.userId,
    action: 'upload.photo',
    details: { filename, originalName: file.name, size: file.size },
    entity: 'upload',
  });

  return apiResponse({ url: photoUrl, thumbnailUrl });
});
