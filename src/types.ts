export const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
export type Season = (typeof SEASONS)[number];

export const SHOE_TYPES = [
  "sneakers",
  "boots",
  "ankle",
  "heels",
  "flats",
  "loafers",
  "sandals",
  "slippers",
  "other",
] as const;
export type ShoeType = (typeof SHOE_TYPES)[number];

export const SEASON_INFO: Record<Season, { label: string; short: string; hint: string }> = {
  winter: { label: "Зима", short: "Зима", hint: "Мороз, снег, слякоть" },
  spring: { label: "Весна", short: "Весна", hint: "Дождь и прохлада" },
  summer: { label: "Лето", short: "Лето", hint: "Жара и прогулки" },
  autumn: { label: "Осень", short: "Осень", hint: "Ветер и лужи" },
};

export const TYPE_LABELS: Record<ShoeType, string> = {
  sneakers: "Кроссовки",
  boots: "Сапоги",
  ankle: "Ботинки",
  heels: "Туфли",
  flats: "Балетки",
  loafers: "Лоферы",
  sandals: "Сандалии",
  slippers: "Домашние",
  other: "Другое",
};

export interface Shoe {
  id: string;
  name: string;
  brand: string;
  size: string;
  type: ShoeType;
  color: string;
  seasons: Season[];
  description: string;
  photo: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface ShoeDraft {
  name: string;
  brand: string;
  size: string;
  type: ShoeType;
  color: string;
  seasons: Season[];
  description: string;
  photo: string | null;
}

export const EMPTY_DRAFT: ShoeDraft = {
  name: "",
  brand: "",
  size: "",
  type: "sneakers",
  color: "",
  seasons: [],
  description: "",
  photo: null,
};

export const CATALOG_VERSION = 1;

export interface CatalogFile {
  version: number;
  updatedAt: number;
  items: Shoe[];
}

export type SeasonFilter = "all" | Season;

export type Route =
  | { name: "list" }
  | { name: "detail"; id: string }
  | { name: "form"; id?: string };

export function currentSeason(now = new Date()): Season {
  const month = now.getMonth();
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

export function pairWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "пара";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "пары";
  return "пар";
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `shoe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isShoeType(value: string): value is ShoeType {
  return (SHOE_TYPES as readonly string[]).includes(value);
}

export function isSeason(value: string): value is Season {
  return (SEASONS as readonly string[]).includes(value);
}
