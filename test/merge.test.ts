import { describe, expect, it } from "vitest";
import { mergeCatalogs, parseCatalog, toCatalogFile } from "../src/catalog";
import type { Shoe } from "../src/types";

function shoe(partial: Partial<Shoe> & Pick<Shoe, "id" | "name" | "updatedAt">): Shoe {
  return {
    brand: "",
    size: "",
    type: "sneakers",
    color: "",
    seasons: [],
    description: "",
    photo: null,
    createdAt: partial.updatedAt,
    deletedAt: null,
    ...partial,
  };
}

describe("mergeCatalogs", () => {
  it("оставляет более новую карточку при конфликте id", () => {
    const local = [shoe({ id: "1", name: "Локальные", updatedAt: 10, brand: "A" })];
    const remote = [shoe({ id: "1", name: "С Диска", updatedAt: 20, brand: "B" })];
    const merged = mergeCatalogs(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("С Диска");
    expect(merged[0].brand).toBe("B");
  });

  it("сохраняет локальную карточку, если она новее", () => {
    const local = [shoe({ id: "1", name: "Новая локально", updatedAt: 50 })];
    const remote = [shoe({ id: "1", name: "Старая на Диске", updatedAt: 10 })];
    expect(mergeCatalogs(local, remote)[0].name).toBe("Новая локально");
  });

  it("объединяет разные карточки с двух устройств", () => {
    const local = [shoe({ id: "local", name: "Домашние", updatedAt: 1 })];
    const remote = [shoe({ id: "remote", name: "Сапоги", updatedAt: 2 })];
    const merged = mergeCatalogs(local, remote);
    expect(merged.map((item) => item.id).sort()).toEqual(["local", "remote"]);
  });

  it("передаёт удаление через надгробие", () => {
    const local = [shoe({ id: "1", name: "Удалено", updatedAt: 30, deletedAt: 30 })];
    const remote = [shoe({ id: "1", name: "Ещё есть", updatedAt: 10 })];
    const merged = mergeCatalogs(local, remote);
    expect(merged[0].deletedAt).toBe(30);
  });

  it("не восстанавливает удалённую карточку более старой копией", () => {
    const local = [shoe({ id: "1", name: "Живая", updatedAt: 5 })];
    const remote = [shoe({ id: "1", name: "Удалено", updatedAt: 40, deletedAt: 40 })];
    expect(mergeCatalogs(local, remote)[0].deletedAt).toBe(40);
  });

  it("подставляет локальное фото, если метаданные совпадают по времени", () => {
    const local = [
      shoe({
        id: "1",
        name: "Кеды",
        updatedAt: 10,
        photo: "data:image/jpeg;base64,abc",
      }),
    ];
    const remote = [shoe({ id: "1", name: "Кеды", updatedAt: 10, photo: null })];
    expect(mergeCatalogs(local, remote)[0].photo).toBe("data:image/jpeg;base64,abc");
  });

  it("не затирает фото более новой записью без снимка", () => {
    const local = [
      shoe({
        id: "1",
        name: "Кеды",
        updatedAt: 10,
        photo: "data:image/jpeg;base64,abc",
      }),
    ];
    const remote = [shoe({ id: "1", name: "Кеды", updatedAt: 20, photo: null })];
    expect(mergeCatalogs(local, remote)[0].photo).toBe("data:image/jpeg;base64,abc");
    expect(mergeCatalogs(local, remote)[0].updatedAt).toBe(20);
  });
});

describe("parseCatalog", () => {
  it("принимает сериализованный каталог с фото", () => {
    const items = [
      shoe({
        id: "1",
        name: "Ботинки",
        updatedAt: 9,
        photo: "data:image/jpeg;base64,qq",
        seasons: ["winter"],
      }),
    ];
    const parsed = parseCatalog(JSON.parse(JSON.stringify(toCatalogFile(items, 9))));
    expect(parsed.items[0].photo).toBe("data:image/jpeg;base64,qq");
    expect(parsed.items[0].seasons).toEqual(["winter"]);
  });

  it("отбрасывает записи без id", () => {
    const parsed = parseCatalog({ version: 1, updatedAt: 1, items: [{ name: "нет id" }] });
    expect(parsed.items).toEqual([]);
  });
});
