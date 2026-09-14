import type { Shoe } from "./types";
import { normalizeShoe } from "./catalog";

const DB_NAME = "polka-wardrobe";
const STORE = "shoes";
const VERSION = 1;

type IDBFactoryLike = Pick<IDBFactory, "open">;

export interface WardrobeDb {
  listAll(): Promise<Shoe[]>;
  put(shoe: Shoe): Promise<void>;
  putAll(items: Shoe[]): Promise<void>;
  remove(id: string): Promise<void>;
}

function requireIndexedDb(): IDBFactoryLike {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB недоступна в этом браузере.");
  }
  return indexedDB;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ошибка IndexedDB."));
  });
}

export function openWardrobeDb(factory: IDBFactoryLike = requireIndexedDb()): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальную базу."));
  });
}

export function createWardrobeDb(factory?: IDBFactoryLike): WardrobeDb {
  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T> | T,
  ): Promise<T> {
    const db = await openWardrobeDb(factory);
    try {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      return await run(store);
    } finally {
      db.close();
    }
  }

  return {
    async listAll() {
      const rows = await withStore("readonly", (store) => requestToPromise(store.getAll()));
      return (rows as unknown[])
        .map((row) => normalizeShoe(row))
        .filter((row): row is Shoe => row !== null);
    },
    async put(shoe) {
      await withStore("readwrite", (store) => requestToPromise(store.put(shoe)));
    },
    async putAll(items) {
      await withStore("readwrite", async (store) => {
        await requestToPromise(store.clear());
        for (const item of items) {
          await requestToPromise(store.put(item));
        }
      });
    },
    async remove(id) {
      await withStore("readwrite", (store) => requestToPromise(store.delete(id)));
    },
  };
}

export const wardrobeDb = createWardrobeDb();
