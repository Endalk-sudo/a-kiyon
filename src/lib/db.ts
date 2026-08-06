import { getFirestore, Timestamp, Filter, AggregateField } from 'firebase-admin/firestore';
import type {
  DocumentSnapshot,
  QuerySnapshot,
  WhereFilterOp,
  OrderByDirection,
} from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';

const app = getAdminApp();
export const db = getFirestore(app);

export type Doc<T> = T & { id: string };
export type WhereClause = [string, WhereFilterOp, unknown];
export type OrderClause = [string, OrderByDirection];

// Firestore `in` queries support at most 30 values per clause.
export function chunk<T>(arr: T[], size = 30): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function docToData<T>(snap: DocumentSnapshot): Doc<T> | null {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Doc<T>;
}

function snapshotToArray<T>(snapshot: QuerySnapshot): Doc<T>[] {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Doc<T>);
}

export async function getDocById<T>(collection: string, id: string): Promise<Doc<T> | null> {
  const snap = await db.collection(collection).doc(id).get();
  return docToData<T>(snap);
}

export async function getDocs<T>(
  collection: string,
  where?: WhereClause[],
  orderBy?: OrderClause,
  limit?: number,
  offset?: number,
): Promise<Doc<T>[]> {
  let query: FirebaseFirestore.Query = db.collection(collection);
  if (where) {
    for (const w of where) {
      query = query.where(w[0], w[1], w[2]);
    }
  }
  if (orderBy) {
    query = query.orderBy(orderBy[0], orderBy[1]);
  }
  if (limit) query = query.limit(limit);
  if (offset) query = query.offset(offset);
  const snapshot = await query.get();
  return snapshotToArray<T>(snapshot);
}

export async function countDocs(collection: string, where?: WhereClause[]): Promise<number> {
  let query: FirebaseFirestore.Query = db.collection(collection);
  if (where) {
    for (const w of where) {
      query = query.where(w[0], w[1], w[2]);
    }
  }
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

/**
 * Fetch many documents by id in chunked `in` queries on the document id.
 * Ordering is not preserved — build a Map from the results when order matters.
 */
export async function getDocsByIds<T>(collection: string, ids: string[]): Promise<Doc<T>[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const results = await Promise.all(
    chunk(unique).map((idChunk) =>
      getDocs<T>(collection, [['__name__', 'in', idChunk]]),
    ),
  );
  return results.flat();
}

export async function createDoc<T>(collection: string, data: Record<string, unknown>): Promise<Doc<T>> {
  const now = new Date().toISOString();
  const docRef = await db.collection(collection).add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await docRef.get();
  return docToData<T>(snap)!;
}

export async function createDocWithId<T>(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<Doc<T>> {
  const now = new Date().toISOString();
  await db.collection(collection).doc(id).set({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await db.collection(collection).doc(id).get();
  return docToData<T>(snap)!;
}

export async function updateDoc<T>(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<Doc<T> | null> {
  try {
    await db.collection(collection).doc(id).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return getDocById<T>(collection, id);
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err.code === 5) return null;
    throw e;
  }
}

export async function deleteDoc(collection: string, id: string): Promise<void> {
  await db.collection(collection).doc(id).delete();
}

export async function batchUpdate(
  collection: string,
  where: WhereClause[],
  data: Record<string, unknown>,
): Promise<number> {
  const docs = await getDocs<Record<string, unknown>>(collection, where);
  if (docs.length === 0) return 0;
  const now = new Date().toISOString();
  // A single Firestore batch is limited to 500 writes.
  const BATCH_LIMIT = 400;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
      batch.update(db.collection(collection).doc(doc.id), {
        ...data,
        updatedAt: now,
      });
    }
    await batch.commit();
  }
  return docs.length;
}

export async function batchDelete(collection: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  // A single Firestore batch is limited to 500 writes.
  const BATCH_LIMIT = 400;
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.delete(db.collection(collection).doc(id));
    }
    await batch.commit();
  }
  return ids.length;
}

export async function aggregateSum(
  collection: string,
  field: string,
  where?: WhereClause[],
): Promise<number> {
  let query: FirebaseFirestore.Query = db.collection(collection);
  if (where) {
    for (const w of where) {
      query = query.where(w[0], w[1], w[2]);
    }
  }
  const aggregateQuery = query.aggregate({
    total: AggregateField.sum(field),
  });
  const snapshot = await aggregateQuery.get();
  return snapshot.data().total ?? 0;
}

export { Timestamp, Filter, AggregateField };
