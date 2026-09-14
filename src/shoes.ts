import type { DatabaseHandle } from "./db.js";

export const SEASONS = ["all", "winter", "spring", "summer", "autumn"] as const;
export type Season = (typeof SEASONS)[number];

export interface Shoe {
  id: number;
  name: string;
  brand: string;
  description: string;
  season: Season;
  size: string;
  color: string;
  photoUrl: string;
  photoKey: string;
  createdAt: string;
}

export interface NewShoe {
  name: string;
  brand?: string;
  description?: string;
  season?: Season;
  size?: string;
  color?: string;
  photoUrl?: string;
  photoKey?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ListFilter {
  season?: Season;
  query?: string;
}

interface ShoeRow {
  id: number;
  name: string;
  brand: string;
  description: string;
  season: string;
  size: string;
  color: string;
  photo_url: string;
  photo_key: string;
  created_at: string;
}

function toShoe(row: ShoeRow): Shoe {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    description: row.description,
    season: (SEASONS as readonly string[]).includes(row.season)
      ? (row.season as Season)
      : "all",
    size: row.size,
    color: row.color,
    photoUrl: row.photo_url,
    photoKey: row.photo_key,
    createdAt: row.created_at,
  };
}

export class ShoeRepository {
  constructor(private readonly db: DatabaseHandle) {}

  list(filter: ListFilter = {}): Shoe[] {
    const clauses: string[] = [];
    const params: Record<string, string> = {};

    if (filter.season && filter.season !== "all") {
      clauses.push("season = @season");
      params.season = filter.season;
    }
    if (filter.query && filter.query.trim().length > 0) {
      clauses.push(
        "(name LIKE @q OR brand LIKE @q OR color LIKE @q OR size LIKE @q OR description LIKE @q)",
      );
      params.q = `%${filter.query.trim()}%`;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM shoes ${where} ORDER BY datetime(created_at) DESC, id DESC`)
      .all(params) as ShoeRow[];
    return rows.map(toShoe);
  }

  get(id: number): Shoe | undefined {
    const row = this.db.prepare("SELECT * FROM shoes WHERE id = ?").get(id) as
      | ShoeRow
      | undefined;
    return row ? toShoe(row) : undefined;
  }

  create(input: NewShoe): Shoe {
    const info = this.db
      .prepare(
        `INSERT INTO shoes (name, brand, description, season, size, color, photo_url, photo_key)
         VALUES (@name, @brand, @description, @season, @size, @color, @photoUrl, @photoKey)`,
      )
      .run({
        name: input.name.trim(),
        brand: (input.brand ?? "").trim(),
        description: (input.description ?? "").trim(),
        season: input.season ?? "all",
        size: (input.size ?? "").trim(),
        color: (input.color ?? "").trim(),
        photoUrl: input.photoUrl ?? "",
        photoKey: input.photoKey ?? "",
      });
    const created = this.get(Number(info.lastInsertRowid));
    if (!created) {
      throw new Error("Не удалось прочитать созданную запись.");
    }
    return created;
  }

  delete(id: number): Shoe | undefined {
    const existing = this.get(id);
    if (!existing) {
      return undefined;
    }
    this.db.prepare("DELETE FROM shoes WHERE id = ?").run(id);
    return existing;
  }
}

export function validateNewShoe(fields: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!fields.name || fields.name.trim().length === 0) {
    errors.push({ field: "name", message: "Укажите название." });
  }

  if (fields.season && !(SEASONS as readonly string[]).includes(fields.season)) {
    errors.push({
      field: "season",
      message: `Сезон должен быть одним из: ${SEASONS.join(", ")}.`,
    });
  }

  return errors;
}
