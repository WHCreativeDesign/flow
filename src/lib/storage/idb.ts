/*
  Minimal IndexedDB helper for binary payloads (camera captures, music
  tracks). Structured app state goes through InstanceClient; this is only
  for blobs, which don't belong in JSON state.
*/
const DB_NAME = 'flow';
const DB_VERSION = 1;
const STORES = ['photos', 'tracks'] as const;
export type BlobStore = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) {
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: BlobStore, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const idb = {
  get: (store: BlobStore, key: string) => tx<unknown>(store, 'readonly', (s) => s.get(key)),
  set: (store: BlobStore, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: BlobStore, key: string) => tx(store, 'readwrite', (s) => s.delete(key)),
  keys: (store: BlobStore) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()),
  all: (store: BlobStore) => tx<unknown[]>(store, 'readonly', (s) => s.getAll())
};
