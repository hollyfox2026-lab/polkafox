import { describe, expect, it } from "vitest";
import type { Shoe } from "../src/types";
import type { WardrobeDb } from "../src/db";
import type { CatalogFile } from "../src/types";
import { createYandexDiskClient, type YandexDiskClient } from "../src/yandex/disk";
import { syncErrorMessage, syncWithDisk } from "../src/yandex/sync";
import { YandexDiskError } from "../src/yandex/disk";
import { activeShoes } from "../src/catalog";

function memoryDb(seed: Shoe[] = []): WardrobeDb {
  const items = new Map(seed.map((item) => [item.id, item]));
  return {
    async listAll() {
      return [...items.values()];
    },
    async put(shoe) {
      items.set(shoe.id, shoe);
    },
    async putAll(next) {
      items.clear();
      for (const item of next) items.set(item.id, item);
    },
    async remove(id) {
      items.delete(id);
    },
  };
}

function shoe(id: string, name: string, updatedAt: number, extra: Partial<Shoe> = {}): Shoe {
  return {
    id,
    name,
    brand: "",
    size: "37",
    type: "boots",
    color: "",
    seasons: ["winter"],
    description: "",
    photo: extra.photo ?? "data:image/jpeg;base64,abc",
    createdAt: updatedAt,
    updatedAt,
    deletedAt: extra.deletedAt ?? null,
    ...extra,
  };
}

function stubDisk(partial: Partial<YandexDiskClient> = {}): YandexDiskClient {
  return {
    async getUser() {
      return { login: "fox", displayName: "Fox" };
    },
    async ensureFolder() {
      return "app:/";
    },
    async downloadCatalog() {
      return null;
    },
    async uploadCatalog() {},
    async downloadPhoto() {
      return null;
    },
    async uploadPhoto() {},
    ...partial,
  };
}

describe("syncWithDisk", () => {
  it("загружает каталог с Диска на пустое устройство", async () => {
    const remoteItems = [shoe("r1", "Сапоги с Диска", 10)];
    const result = await syncWithDisk(
      memoryDb(),
      stubDisk({
        async downloadCatalog() {
          return { version: 1, updatedAt: 10, items: remoteItems };
        },
      }),
    );
    expect(result.pulled).toBe(true);
    expect(activeShoes(result.items)[0].name).toBe("Сапоги с Диска");
    expect(result.items[0].photo).toContain("data:image/jpeg");
  });

  it("отправляет локальный каталог, если на Диске пусто", async () => {
    let uploaded: Shoe[] = [];
    const photos: string[] = [];
    const local = [shoe("l1", "Локальные кеды", 5)];
    const result = await syncWithDisk(
      memoryDb(local),
      stubDisk({
        async uploadCatalog(items) {
          uploaded = items;
        },
        async uploadPhoto(id) {
          photos.push(id);
        },
      }),
    );
    expect(result.pulled).toBe(false);
    expect(uploaded[0].name).toBe("Локальные кеды");
    expect(photos).toEqual(["l1"]);
    expect(result.pushed).toBe(true);
    expect(result.photoCount).toBe(1);
  });

  it("сливает карточки с двух устройств и сохраняет обе", async () => {
    const diskStore: { catalog: CatalogFile | null } = {
      catalog: { version: 1, updatedAt: 8, items: [shoe("d1", "Дисковые", 8)] },
    };
    const result = await syncWithDisk(
      memoryDb([shoe("l1", "Локальные", 3)]),
      stubDisk({
        async downloadCatalog() {
          return diskStore.catalog;
        },
        async uploadCatalog(items) {
          diskStore.catalog = { version: 1, updatedAt: Date.now(), items };
        },
      }),
    );
    const names = activeShoes(result.items)
      .map((item) => item.name)
      .sort();
    expect(names).toEqual(["Дисковые", "Локальные"]);
  });

  it("не записывает на Диск пустой каталог с нового устройства", async () => {
    let uploaded: Shoe[] | null = null;
    const result = await syncWithDisk(
      memoryDb(),
      stubDisk({
        async uploadCatalog(items) {
          uploaded = items;
        },
      }),
    );
    expect(result.pushed).toBe(false);
    expect(uploaded).toBeNull();
    expect(result.items).toEqual([]);
  });

  it("на пустом устройстве качает фото даже без hasPhoto", async () => {
    const remoteMeta = [shoe("r1", "Сапоги с Диска", 10, { photo: null })];
    const result = await syncWithDisk(
      memoryDb(),
      stubDisk({
        async downloadCatalog() {
          return { version: 2, updatedAt: 10, items: remoteMeta };
        },
        async downloadPhoto() {
          return "data:image/jpeg;base64,from-disk";
        },
      }),
    );
    expect(result.pulled).toBe(true);
    expect(activeShoes(result.items)[0].photo).toBe("data:image/jpeg;base64,from-disk");
  });

  it("не считает ошибку чтения Диска пустым каталогом", async () => {
    let uploaded = false;
    await expect(
      syncWithDisk(
        memoryDb(),
        stubDisk({
          async downloadCatalog() {
            throw new Error("Failed to fetch");
          },
          async uploadCatalog() {
            uploaded = true;
          },
        }),
      ),
    ).rejects.toThrow(/Failed to fetch/);
    expect(uploaded).toBe(false);
  });
});

describe("syncErrorMessage", () => {
  it("поясняет истекшую сессию", () => {
    expect(syncErrorMessage(new YandexDiskError("nope", 401))).toMatch(/истекла/i);
  });
});

describe("createYandexDiskClient typing smoke", () => {
  it("экспортирует фабрику клиента", () => {
    expect(typeof createYandexDiskClient).toBe("function");
  });
});
