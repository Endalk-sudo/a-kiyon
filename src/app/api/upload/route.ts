import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError } from '@/lib/api';
import { apiHandler } from '@/lib/api-handler';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getFileStore } from '@/lib/file-storage';

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

  const store = getFileStore();
  if (!store) return apiError('Storage not configured', 500);

  const uuid = randomUUID();
  const filePath = `uploads/${uuid}.webp`;
  const thumbPath = `uploads/thumbs/${uuid}-thumb.webp`;

  image = sharp(buffer).webp({ quality: 80 });

  const fullBuffer = await image.clone().toBuffer();
  const thumbBuffer = await image.clone().resize(200, 200, { fit: 'cover' }).toBuffer();

  try {
    const [photo, thumb] = await Promise.all([
      store.save(filePath, fullBuffer, 'image/webp'),
      store.save(thumbPath, thumbBuffer, 'image/webp'),
    ]);

    return apiResponse({ url: photo.url, thumbnailUrl: thumb.url });
  } catch (err) {
    // Don't leave orphans behind if a later step fails.
    await Promise.allSettled([store.delete(filePath), store.delete(thumbPath)]);
    throw err;
  }
});
