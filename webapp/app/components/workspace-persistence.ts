import type { WorkspaceSnapshot } from "../types/exerpt";

const databaseName = "exerpt-workspace";
const databaseVersion = 1;
const storeName = "snapshots";
const currentSnapshotKey = "current";

export async function loadWorkspaceSnapshot() {
  const database = await openDatabase();
  return requestToPromise<WorkspaceSnapshot | undefined>(
    database.transaction(storeName, "readonly").objectStore(storeName).get(currentSnapshotKey)
  ).finally(() => database.close());
}

export async function saveWorkspaceSnapshot(snapshot: WorkspaceSnapshot) {
  const database = await openDatabase();
  await requestToPromise(
    database.transaction(storeName, "readwrite").objectStore(storeName).put(snapshot, currentSnapshotKey)
  ).finally(() => database.close());
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open workspace database."));
  });
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Workspace persistence request failed."));
  });
}
