import type { CatalogFile, Shoe } from "./types";
import { CATALOG_VERSION, isSeason, isShoeType } from "./types";

export function activeShoes(items: Shoe[]): Shoe[] {
  return items
    .filter((item) => !item.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Объединяет локальный и удалённый каталоги.
 * Для каждой карточки сохраняется запись с большим updatedAt.
 * Удаление передаётся через поле deletedAt (надгробие), чтобы оно дошло до других устройств.
 */
export function mergeCatalogs(local: Shoe[], remote: Shoe[]): Shoe[] {
  const map = new Map<string, Shoe>();
  for (const item of [...local, ...remote]) {
    const normalized = normalizeShoe(item);
    if (!normalized) continue;
    const previous = map.get(normalized.id);
    if (!previous || normalized.updatedAt > previous.updatedAt) {
      const photo = normalized.deletedAt
        ? normalized.photo
        : preferPhoto(normalized.photo, previous?.photo ?? null);
      map.set(normalized.id, { ...normalized, photo, hasPhoto: Boolean(normalized.hasPhoto || photo) });
    } else if (normalized.updatedAt === previous.updatedAt) {
      const photo = preferPhoto(previous.photo, normalized.photo);
      map.set(normalized.id, {
        ...previous,
        hasPhoto: Boolean(previous.hasPhoto || normalized.hasPhoto || photo),
        photo,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function catalogUpdatedAt(items: Shoe[], fallback = 0): number {
  return items.reduce((max, item) => Math.max(max, item.updatedAt, item.deletedAt ?? 0), fallback);
}

export function toCatalogFile(items: Shoe[], now = Date.now()): CatalogFile {
  return {
    version: CATALOG_VERSION,
    updatedAt: Math.max(now, catalogUpdatedAt(items)),
    items: items.map(cloneShoe),
  };
}

/** Каталог для Диска: фотографии отдельно, в JSON только признак hasPhoto. */
export function toDiskCatalog(items: Shoe[], now = Date.now()): CatalogFile {
  return {
    version: CATALOG_VERSION,
    updatedAt: Math.max(now, catalogUpdatedAt(items)),
    items: items.map((item) => ({
      ...cloneShoe(item),
      photo: null,
      hasPhoto: Boolean(item.photo) || Boolean(item.hasPhoto),
    })),
  };
}

export function parseCatalog(raw: unknown): CatalogFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Каталог на Диске повреждён: ожидался объект JSON.");
  }
  const data = raw as Partial<CatalogFile>;
  const items = Array.isArray(data.items) ? data.items : [];
  const parsed = items
    .map((item) => normalizeShoe(item))
    .filter((item): item is Shoe => item !== null);
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : catalogUpdatedAt(parsed);
  return {
    version: typeof data.version === "number" ? data.version : CATALOG_VERSION,
    updatedAt,
    items: parsed,
  };
}

export function cloneShoe(item: Shoe): Shoe {
  return {
    ...item,
    seasons: [...item.seasons],
    deletedAt: item.deletedAt ?? null,
  };
}

/** Снимок в IndexedDB: data URL или https-превью Диска. */
export function parseStoredPhoto(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length < 8) return null;
  if (raw.startsWith("data:image/")) return raw;
  if (raw.startsWith("https://")) return raw;
  return null;
}

export function isInlinePhoto(photo: string | null | undefined): boolean {
  return Boolean(photo?.startsWith("data:"));
}

export function preferPhoto(primary: string | null, fallback: string | null): string | null {
  if (isInlinePhoto(primary)) return primary;
  if (isInlinePhoto(fallback)) return fallback;
  return primary || fallback;
}

export function normalizeShoe(raw: unknown): Shoe | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Shoe> & { id?: unknown };
  if (typeof item.id !== "string" || item.id.length === 0) return null;
  if (typeof item.name !== "string") return null;

  const type = typeof item.type === "string" && isShoeType(item.type) ? item.type : "other";
  const seasons = Array.isArray(item.seasons)
    ? item.seasons.filter((season): season is Shoe["seasons"][number] => isSeason(String(season)))
    : [];

  const createdAt = toTimestamp(item.createdAt) ?? Date.now();
  const updatedAt = toTimestamp(item.updatedAt) ?? createdAt;
  const deletedAt = item.deletedAt == null ? null : toTimestamp(item.deletedAt);

  return {
    id: item.id,
    name: item.name.trim() || "Без названия",
    brand: typeof item.brand === "string" ? item.brand : "",
    size: typeof item.size === "string" ? item.size : "",
    type,
    color: typeof item.color === "string" ? item.color : "",
    seasons,
    description: typeof item.description === "string" ? item.description : "",
    photo: parseStoredPhoto(item.photo),
    hasPhoto: Boolean(item.hasPhoto) || Boolean(parseStoredPhoto(item.photo)),
    createdAt,
    updatedAt,
    deletedAt,
  };
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
