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

describe("syncWithDisk", () => {
  it("загружает каталог с Диска на пустое устройство", async () => {
    const remoteItems = [shoe("r1", "Сапоги с Диска", 10)];
    const disk: YandexDiskClient = {
      async getUser() {
        return { login: "fox", displayName: "Fox" };
      },
      async ensureFolder() {
        return "app:/polka";
      },
      async downloadCatalog() {
        return { version: 1, updatedAt: 10, items: remoteItems };
      },
      async uploadCatalog() {},
    };
    const db = memoryDb();
    const result = await syncWithDisk(db, disk);
    expect(result.pulled).toBe(true);
    expect(activeShoes(result.items)[0].name).toBe("Сапоги с Диска");
    expect((await db.listAll())[0].photo).toContain("data:image/jpeg");
  });

  it("отправляет локальный каталог, если на Диске пусто", async () => {
    let uploaded: Shoe[] = [];
    const disk: YandexDiskClient = {
      async getUser() {
        return { login: "fox", displayName: "Fox" };
      },
      async ensureFolder() {
        return "app:/polka";
      },
      async downloadCatalog() {
        return null;
      },
      async uploadCatalog(items) {
        uploaded = items;
      },
    };
    const local = [shoe("l1", "Локальные кеды", 5)];
    const result = await syncWithDisk(memoryDb(local), disk);
    expect(result.pulled).toBe(false);
    expect(uploaded[0].name).toBe("Локальные кеды");
    expect(uploaded[0].photo).toContain("data:image/jpeg");
  });

  it("сливает карточки с двух устройств и сохраняет обе", async () => {
    const diskStore: { catalog: CatalogFile | null } = {
      catalog: { version: 1, updatedAt: 8, items: [shoe("d1", "Дисковые", 8)] },
    };
    const disk: YandexDiskClient = {
      async getUser() {
        return { login: "fox", displayName: "Fox" };
      },
      async ensureFolder() {
        return "app:/polka";
      },
      async downloadCatalog() {
        return diskStore.catalog;
      },
      async uploadCatalog(items) {
        diskStore.catalog = { version: 1, updatedAt: Date.now(), items };
      },
    };
    const result = await syncWithDisk(memoryDb([shoe("l1", "Локальные", 3)]), disk);
    const names = activeShoes(result.items)
      .map((item) => item.name)
      .sort();
    expect(names).toEqual(["Дисковые", "Локальные"]);
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
