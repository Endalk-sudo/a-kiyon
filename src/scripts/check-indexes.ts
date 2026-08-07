import 'dotenv/config';
import { readFileSync } from 'fs';
import { globSync } from 'fs';
import path from 'path';

/**
 * Static guard: every Firestore composite query in `src` must be covered by
 * firestore.indexes.json. The emulator auto-creates indexes, so a missing
 * index only fails in production — this script catches that before deploy.
 *
 * Run: pnpm exec tsx src/scripts/check-indexes.ts
 * Exit code 1 (and a deploy-ready JSON snippet) when an index is missing.
 *
 * Two query shapes are parsed:
 *   1. db helpers:   getDocs('payments', [['f','==',v]], ['date','desc'])
 *   2. SDK chains:   db.collection('x').where('f','==',v).orderBy('date')
 * Calls with variable where/orderBy clauses (built at runtime) cannot be
 * verified statically and are skipped.
 */

interface IndexEntry {
  collectionGroup: string;
  fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[];
}

interface RequiredIndex {
  collection: string;
  fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[];
  source: string;
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const INDEXES_FILE = path.join(ROOT, 'firestore.indexes.json');
const SRC_GLOB = path.join(ROOT, 'src', '**', '*.ts');

function loadIndexes(): IndexEntry[] {
  const raw = JSON.parse(readFileSync(INDEXES_FILE, 'utf8')) as { indexes: IndexEntry[] };
  return raw.indexes;
}

function normalizeField(fieldPath: string, order: string | undefined): string {
  return `${fieldPath} ${order === 'DESCENDING' || order === 'desc' ? 'DESC' : 'ASC'}`;
}

// Parses `[['a', '==', v], ['b', '>=', v]]` — captures each [field, op].
function parseWhereArray(content: string): { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[] {
  const fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[] = [];
  const itemRe = /\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(content)) !== null) {
    fields.push({ fieldPath: m[1], order: 'ASCENDING' });
  }
  return fields;
}

// Parses `['createdAt', 'desc']` or `['paymentDate']`.
function parseOrderByArray(content: string): { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[] {
  const fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[] = [];
  const itemRe = /\[\s*'([^']+)'\s*(?:,\s*'([^']+)')?\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(content)) !== null) {
    fields.push({ fieldPath: m[1], order: m[2] === 'desc' ? 'DESCENDING' : 'ASCENDING' });
  }
  return fields;
}

function needsComposite(fields: { fieldPath: string }[]): boolean {
  const distinct = new Set(fields.map((f) => f.fieldPath));
  return distinct.size >= 2;
}

// Dedupes repeated field paths (e.g. endDate in both `<=` and `>=` filters)
// — the index is on the field, not per clause.
function dedupeFields(fields: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[]) {
  const seen = new Set<string>();
  const out: { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }[] = [];
  for (const f of fields) {
    if (seen.has(f.fieldPath)) continue;
    seen.add(f.fieldPath);
    out.push(f);
  }
  return out;
}

function collectHelperQueries(file: string, source: string, required: RequiredIndex[]) {
  const re = /(?:getDocs|getDocsByIds|countDocs|aggregateSum)<[^>]*>\s*\(\s*'([^']+)'\s*,\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const collection = m[1];

    // Walk the call body with balanced brackets: top-level `[...]` blocks are
    // the where array and (if present) the orderBy array.
    const arrays: string[] = [];
    let outerDepth = 0;
    let arrDepth = 0;
    let arrStart = -1;
    const bodyStart = m.index + m[0].length;
    for (let i = bodyStart; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') outerDepth++;
      else if (ch === ')') {
        if (outerDepth === 0) break;
        outerDepth--;
      } else if (ch === '[') {
        if (arrDepth === 0) arrStart = i + 1;
        arrDepth++;
      } else if (ch === ']') {
        arrDepth--;
        if (arrDepth === 0 && arrStart >= 0) {
          arrays.push(source.slice(arrStart, i));
          arrStart = -1;
        }
      }
    }

    if (arrays.length === 0) continue;
    const whereContent = arrays[0];
    // Runtime-built where/orderBy (variable references) cannot be verified
    // statically — skip.
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*/.test(whereContent.trim()) && whereContent.trim() !== '') {
      const first = whereContent.trim();
      if (!first.startsWith("'") && !first.startsWith('[')) continue;
    }
    const equality = parseWhereArray(whereContent);
    const orderBy = arrays.length > 1 ? parseOrderByArray(arrays[1]) : [];
    const fields = dedupeFields([...equality, ...orderBy]);
    if (!needsComposite(fields)) continue;
    required.push({ collection, fields, source: `${file}:${filePosition(source, m.index)}` });
  }
}

function collectChainQueries(file: string, source: string, required: RequiredIndex[]) {
  const chainRe = /\.collection\('([^']+)'\)/g;
  const whereRe = /\.where\('([^']+)',\s*'([^']+)'/g;
  const orderByRe = /\.orderBy\('([^']+)'(?:,\s*'([^']+)')?/g;
  let cm: RegExpExecArray | null;
  while ((cm = chainRe.exec(source)) !== null) {
    const collection = cm[1];
    // Look ahead a bounded window (chains are short) for the where/orderBy calls.
    const windowStart = cm.index + cm[0].length;
    const window = source.slice(windowStart, windowStart + 400);
    const equality = [];
    let wm: RegExpExecArray | null;
    whereRe.lastIndex = 0;
    while ((wm = whereRe.exec(window)) !== null) {
      equality.push({ fieldPath: wm[1], order: 'ASCENDING' as const });
    }
    const orderBy = [];
    let om: RegExpExecArray | null;
    orderByRe.lastIndex = 0;
    while ((om = orderByRe.exec(window)) !== null) {
      orderBy.push({ fieldPath: om[1], order: om[2] === 'desc' ? 'DESCENDING' as const : 'ASCENDING' as const });
    }
    const fields = dedupeFields([...equality, ...orderBy]);
    if (!needsComposite(fields)) continue;
    required.push({ collection, fields, source: `${file}:${filePosition(source, cm.index)}` });
  }
}

function filePosition(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function isCovered(required: RequiredIndex, indexes: IndexEntry[]): boolean {
  const reqKey = required.fields.map((f) => normalizeField(f.fieldPath, f.order));
  return indexes.some((entry) => {
    if (entry.collectionGroup !== required.collection) return false;
    const entryKey = entry.fields.map((f) => normalizeField(f.fieldPath, f.order));
    if (entryKey.length < reqKey.length) return false;
    // Query fields must be a contiguous prefix of the index fields.
    return reqKey.every((f, i) => entryKey[i] === f);
  });
}

function main() {
  const indexes = loadIndexes();
  const files = globSync(SRC_GLOB).filter((f) => !f.includes('__tests__') && !f.includes('/scripts/'));
  const required: RequiredIndex[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    collectHelperQueries(file, source, required);
    collectChainQueries(file, source, required);
  }

  const missing = required.filter((r) => !isCovered(r, indexes));
  const covered = required.length - missing.length;

  console.log(`Checked ${required.length} composite queries (${covered} covered, ${missing.length} missing).`);

  if (missing.length > 0) {
    console.error('\nMISSING COMPOSITE INDEXES (fail in production, pass in emulator):');
    for (const req of missing) {
      console.error(`\n  ${req.source}`);
      console.error(`    collection: ${req.collection}`);
      console.error(`    fields: ${req.fields.map((f) => `${f.fieldPath} ${f.order === 'DESCENDING' ? 'DESC' : 'ASC'}`).join(', ')}`);
    }
    console.error('\nAdd to firestore.indexes.json:');
    console.error(JSON.stringify({
      indexes: missing.map((r) => ({
        collectionGroup: r.collection,
        queryScope: 'COLLECTION',
        fields: r.fields.map((f) => ({ fieldPath: f.fieldPath, order: f.order })),
      })),
    }, null, 2));
    process.exitCode = 1;
  }
}

main();
