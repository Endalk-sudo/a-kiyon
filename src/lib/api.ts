import { NextResponse } from 'next/server';

/**
 * Parse an integer query parameter with a fallback. NaN (e.g. `?page=abc`)
 * must never reach Firestore's skip/limit — it silently disables pagination.
 */
export function parseIntParam(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function apiResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function paginatedResponse(data: unknown[], pagination: {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}) {
  return NextResponse.json({ data, pagination });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorizedError() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenError() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
