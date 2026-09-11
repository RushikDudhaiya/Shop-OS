/** Minimal IndexedDB offline mutation queue (Phase 11) */

const DB_NAME = "shop_os_offline";
const STORE = "mutations";
const DB_VERSION = 1;

export type OfflineMutation = {
  id: string;
  shopId: string;
  path: string;
  method: string;
  body: unknown;
  idempotencyKey: string;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueMutation(
  input: Omit<OfflineMutation, "id" | "createdAt" | "status">,
): Promise<OfflineMutation> {
  const db = await openDb();
  const mutation: OfflineMutation = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return mutation;
}

export async function listPendingMutations(): Promise<OfflineMutation[]> {
  const db = await openDb();
  const items = await new Promise<OfflineMutation[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as OfflineMutation[]).filter((m) => m.status !== "syncing"),
      );
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeMutation(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function markFailed(id: string, lastError: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as OfflineMutation | undefined;
      if (row) {
        row.status = "failed";
        row.lastError = lastError;
        store.put(row);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function flushQueue(
  send: (m: OfflineMutation) => Promise<void>,
): Promise<{ synced: number; failed: number }> {
  const pending = await listPendingMutations();
  let synced = 0;
  let failed = 0;
  for (const m of pending) {
    try {
      await send(m);
      await removeMutation(m.id);
      synced += 1;
    } catch (err) {
      await markFailed(
        m.id,
        err instanceof Error ? err.message : "sync failed",
      );
      failed += 1;
    }
  }
  return { synced, failed };
}
