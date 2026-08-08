import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import type { App } from 'firebase-admin/app';
import { getAdminApp } from '../lib/firebase-admin';

/**
 * Compares the composite indexes declared in firestore.indexes.json against
 * the ones actually live on the production project (Firestore REST Admin API).
 * Catches:
 *   - indexes still building after a deploy (state = CREATING)
 *   - indexes that failed to build (state = NEEDS_REPAIR)
 *   - drift from manual console edits or a deploy that never ran
 *
 * Run after deploying: `pnpm run verify-indexes`
 * Uses the FIREBASE_* service-account env vars (reads only, no writes).
 * Exit code 1 when any declared index is missing or not yet READY.
 */

interface IndexEntry {
  collectionGroup: string;
  fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[];
}

interface LiveIndex {
  collectionGroup: string;
  fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[];
  state: 'CREATING' | 'READY' | 'NEEDS_REPAIR';
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const INDEXES_FILE = path.join(ROOT, 'firestore.indexes.json');

function normalizeField(fieldPath: string, order: string): string {
  return `${fieldPath} ${order === 'DESCENDING' ? 'DESC' : 'ASC'}`;
}

function indexKey(index: { collectionGroup: string; fields: { fieldPath: string; order: string }[] }): string {
  return `${index.collectionGroup}|${index.fields.map((f) => normalizeField(f.fieldPath, f.order)).join(',')}`;
}

async function main() {
  const declared = (JSON.parse(readFileSync(INDEXES_FILE, 'utf8')) as { indexes: IndexEntry[] }).indexes;

  if (process.env.FIREBASE_EMULATOR === 'true') {
    throw new Error('verify-indexes checks the live project — unset FIREBASE_EMULATOR (and any *_EMULATOR_HOST vars).');
  }

  const app: App = getAdminApp();
  const projectId = app.options.projectId ?? process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Missing FIREBASE_PROJECT_ID.');

  const credential = app.options.credential as { getAccessToken(): Promise<{ access_token: string }> };
  const { access_token } = await credential.getAccessToken();

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
  const liveComposite: LiveIndex[] = [];
  let pageToken: string | undefined;
  do {
    const listUrl = `${baseUrl}/documents:listCollectionIndexes?alt=json&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!res.ok) {
      throw new Error(`Index listing failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      indexes?: Array<{
        name: string;
        state?: 'CREATING' | 'READY' | 'NEEDS_REPAIR';
        queryScope?: string;
        fields: Array<{ fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }>;
      }>;
      nextPageToken?: string;
    };
    for (const idx of body.indexes ?? []) {
      if (idx.state !== 'CREATING' && idx.state !== 'READY' && idx.state !== 'NEEDS_REPAIR') continue;
      if (idx.queryScope !== 'COLLECTION' && idx.queryScope !== undefined) continue;
      const fields = (idx.fields ?? []).filter((f) => f.fieldPath !== '__name__' && f.fieldPath !== '__collection_group__');
      if (fields.length < 2) continue;
      const collectionGroup = idx.name.split('/collectionGroups/')[1]?.split('/')[0] ?? '';
      liveComposite.push({ collectionGroup, fields, state: idx.state ?? 'READY' });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  const liveByKey = new Map(liveComposite.map((i) => [indexKey(i), i]));

  const missing: { entry: IndexEntry; state?: string }[] = [];
  for (const entry of declared) {
    const live = liveByKey.get(indexKey(entry as unknown as { collectionGroup: string; fields: { fieldPath: string; order: string }[] }));
    if (!live) missing.push({ entry });
    else if (live.state !== 'READY') missing.push({ entry, state: live.state });
  }

  console.log(`Declared ${declared.length} composite indexes; live project has ${liveComposite.length} composite indexes.`);

  if (missing.length === 0) {
    console.log('All declared composite indexes are present and READY.');
    return;
  }

  console.error(`\n${missing.length} declared index(es) not READY in the live project:`);
  for (const m of missing) {
    const fields = m.entry.fields.map((f) => f.fieldPath).join(', ');
    console.error(`  ${m.entry.collectionGroup}(${fields}) — ${m.state ?? 'MISSING'}`);
  }
  console.error(
    missing.every((m) => m.state === 'CREATING')
      ? '\nIndexes are still building — wait a few minutes and re-run (no deploy needed).'
      : '\nDeploy with: firebase deploy --only firestore:indexes (or pnpm run deploy:firestore), then re-run.',
  );
  process.exitCode = 1;
}

main();