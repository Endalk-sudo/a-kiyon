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
 * `aggregateSum` calls additionally require the aggregated field in the
 * composite index (e.g. `sum('amount')` with a filter needs an index ending
 * in `amount ASC`).
 * Calls with variable where/orderBy clauses (built at runtime) cannot be
 * verified statically and are skipped — but every collection touched by an
 * unparseable call must be covered by the RUNTIME_QUERIES registry below,
 * which pins the index shapes those queries need (same check as static
 * queries). A registry shape not covered by firestore.indexes.json fails.
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

/**
 * Query shapes built at runtime (where arrays assembled from options) that
 * the static parser cannot verify. Fields are the index field sequences the
 * app's queries need — equality filters in push order, then the orderBy
 * field. Keep in sync with the services that build these filters
 * (member.service listMembers, subscription.service listSubscriptions,
 * payment.service listPayments, api/services GET includeInactive).
 */
const RUNTIME_QUERIES: RequiredIndex[] = [
  // listMembers: isDeleted equality + createdAt desc
  { collection: 'members', fields: [
    { fieldPath: 'isDeleted', order: 'ASCENDING' },
    { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listMembers (member.service.ts)' },
  // listSubscriptions: any subset of {memberId, serviceId, status} + createdAt desc
  { collection: 'subscriptions', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  { collection: 'subscriptions', fields: [
    { fieldPath: 'serviceId', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  { collection: 'subscriptions', fields: [
    { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  { collection: 'subscriptions', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'serviceId', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  { collection: 'subscriptions', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  { collection: 'subscriptions', fields: [
    { fieldPath: 'serviceId', order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  { collection: 'subscriptions', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'serviceId', order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'createdAt', order: 'DESCENDING' },
  ], source: 'runtime: listSubscriptions (subscription.service.ts)' },
  // listPayments: any subset of {memberId, method, isVoided} (+ optional
  // paymentDate range) + paymentDate desc
  { collection: 'payments', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  { collection: 'payments', fields: [
    { fieldPath: 'method', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  { collection: 'payments', fields: [
    { fieldPath: 'isVoided', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  { collection: 'payments', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'method', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  { collection: 'payments', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'isVoided', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  { collection: 'payments', fields: [
    { fieldPath: 'method', order: 'ASCENDING' }, { fieldPath: 'isVoided', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  { collection: 'payments', fields: [
    { fieldPath: 'memberId', order: 'ASCENDING' }, { fieldPath: 'method', order: 'ASCENDING' }, { fieldPath: 'isVoided', order: 'ASCENDING' }, { fieldPath: 'paymentDate', order: 'DESCENDING' },
  ], source: 'runtime: listPayments (payment.service.ts)' },
  // api/services GET: isActive === true + name asc
  { collection: 'services', fields: [
    { fieldPath: 'isActive', order: 'ASCENDING' }, { fieldPath: 'name', order: 'ASCENDING' },
  ], source: 'runtime: services GET (app/api/services/route.ts)' },
];

function normalizeField(fieldPath: string, order: string | undefined): string {
  return `${fieldPath} ${order === 'DESCENDING' || order === 'desc' ? 'DESC' : 'ASC'}`;
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const INDEXES_FILE = path.join(ROOT, 'firestore.indexes.json');
const SRC_GLOB = path.join(ROOT, 'src', '**', '*.ts');

function loadIndexes(): IndexEntry[] {
  const raw = JSON.parse(readFileSync(INDEXES_FILE, 'utf8')) as { indexes: IndexEntry[] };
  return raw.indexes;
}

function indexKey(entry: IndexEntry): string {
  return `${entry.collectionGroup}|${entry.fields.map((f) => normalizeField(f.fieldPath, f.order)).join(',')}`;
}

function findDuplicates(indexes: IndexEntry[]): IndexEntry[] {
  const seen = new Set<string>();
  const dupes: IndexEntry[] = [];
  for (const entry of indexes) {
    const key = indexKey(entry);
    if (seen.has(key)) dupes.push(entry);
    seen.add(key);
  }
  return dupes;
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

function collectHelperQueries(
  file: string,
  source: string,
  required: RequiredIndex[],
  runtimeDeps: Map<string, string>,
) {
  const re = /(getDocs|getDocsByIds|countDocs|aggregateSum)(?:<[^>]*>)?\s*\(\s*'([^']+)'\s*,\s*(?:'([^']+)')?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const helper = m[1];
    const collection = m[2];
    const aggregateField = m[3];

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

    // Detect a runtime-built where argument: the first top-level `[` in the
    // call body starts the where array — anything before it is the where
    // argument expression. If that expression is a bare identifier (or a
    // ternary of them), the query is built at runtime and cannot be checked
    // statically — record the collection so the registry can pin its shapes.
    let whereRuntime = false;
    let outerScanDepth = 0;
    for (let i = bodyStart; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') outerScanDepth++;
      else if (ch === ')') {
        if (outerScanDepth === 0) break;
        outerScanDepth--;
      } else if (ch === '[' && outerScanDepth === 0) {
        const arg = source.slice(bodyStart, i).replace(/[{}\n\r\t ]/g, '').replace(/^,+/, '').replace(/,+$/, '');
        whereRuntime = /^[a-zA-Z_][a-zA-Z0-9_.?:]*$/.test(arg);
        break;
      }
    }
    if (whereRuntime) {
      runtimeDeps.set(collection, `${file}:${filePosition(source, m.index)}`);
      continue;
    }

    const whereContent = arrays[0];
    const equality = parseWhereArray(whereContent);
    const orderBy = arrays.length > 1 ? parseOrderByArray(arrays[1]) : [];
    const fields = dedupeFields([...equality, ...orderBy]);
    if (helper === 'aggregateSum' && aggregateField) {
      fields.push({ fieldPath: aggregateField, order: 'ASCENDING' });
    }
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

/**
 * Runtime registry coverage: equality filters may appear in the index in any
 * order (Firestore semantics); only the trailing orderBy field is positional.
 */
function isCoveredRuntime(required: RequiredIndex, indexes: IndexEntry[]): boolean {
  if (required.fields.length === 0) return false;
  const eqNames = new Set(required.fields.slice(0, -1).map((f) => f.fieldPath));
  const lastField = required.fields[required.fields.length - 1];
  return indexes.some((entry) => {
    if (entry.collectionGroup !== required.collection) return false;
    if (entry.fields.length === 0) return false;
    const idxLast = entry.fields[entry.fields.length - 1];
    if (idxLast.fieldPath !== lastField.fieldPath || idxLast.order !== lastField.order) return false;
    const idxEq = entry.fields.slice(0, -1).map((f) => f.fieldPath);
    return [...eqNames].every((name) => idxEq.includes(name));
  });
}

function main() {
  const indexes = loadIndexes();
  const dupes = findDuplicates(indexes);
  if (dupes.length > 0) {
    console.error(`DUPLICATE COMPOSITE INDEXES in firestore.indexes.json (${dupes.length}) — remove the extras:`);
    for (const d of dupes) {
      console.error(`  ${indexKey(d)}`);
    }
    process.exitCode = 1;
    return;
  }

  const files = globSync(SRC_GLOB).filter((f) => !f.includes('__tests__') && !f.includes('/scripts/'));
  const required: RequiredIndex[] = [];
  const runtimeDeps = new Map<string, string>();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    collectHelperQueries(file, source, required, runtimeDeps);
    collectChainQueries(file, source, required);
  }

  const registryCollections = new Set(RUNTIME_QUERIES.map((q) => q.collection));
  const unregistered = [...runtimeDeps.entries()].filter(([c]) => !registryCollections.has(c));

  // Merge runtime registry shapes into the coverage check.
  required.push(...RUNTIME_QUERIES);

  const missing = required.filter((r) =>
    !(r.source.startsWith('runtime:') ? isCoveredRuntime(r, indexes) : isCovered(r, indexes)),
  );
  const covered = required.length - missing.length;

  console.log(`Checked ${required.length} composite queries (${covered} covered, ${missing.length} missing).`);

  if (unregistered.length > 0) {
    console.error('\nUNPARSEABLE QUERIES WITHOUT REGISTRY COVERAGE:');
    for (const [collection, source] of unregistered) {
      console.error(`\n  ${source}`);
      console.error(`    collection: ${collection}`);
      console.error('    Add the query shapes to RUNTIME_QUERIES in this script, or refactor');
      console.error('    the call to use literal where/orderBy arrays.');
    }
    process.exitCode = 1;
  }

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
