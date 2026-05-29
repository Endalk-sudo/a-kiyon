import { NextRequest } from 'next/server';
import { getSessionOrThrow } from '@/lib/auth';
import { apiResponse, apiError, unauthorizedError } from '@/lib/api';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionOrThrow(['owner', 'manager']);

    const formData = await request.formData();
    const file = formData.get('photo') as File | null;

    if (!file) {
      return apiError('No photo provided', 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return apiError('Invalid file type. Only JPEG, PNG, and WebP are allowed.', 400);
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return apiError('File too large. Maximum size is 5MB.', 400);
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${randomUUID()}.${ext}`;

    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Write file
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    // Return the URL path
    const photoUrl = `/uploads/${filename}`;

    await createAuditLog({
      userId: session.userId,
      action: 'upload.photo',
      details: { filename, originalName: file.name, size: file.size },
      entity: 'upload',
    });

    return apiResponse({ url: photoUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return unauthorizedError();
    return apiError(message, 500);
  }
}
