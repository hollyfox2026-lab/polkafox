export interface FoxSighting {
  id: number;
  name: string;
  location: string;
  note: string;
  seenAt: string;
}

export interface NewFoxSighting {
  name: string;
  location: string;
  note?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

const seed: Omit<FoxSighting, "id">[] = [
  {
    name: "Rusty",
    location: "Birch Grove",
    note: "Trotted across the path at dawn.",
    seenAt: "2026-08-18T05:42:00.000Z",
  },
  {
    name: "Nimble",
    location: "Old Mill Creek",
    note: "Fishing by the shallows.",
    seenAt: "2026-08-18T19:10:00.000Z",
  },
];

/**
 * Simple in-memory store for fox sightings. State is process-local and resets on
 * restart, which keeps the demo self-contained without an external database.
 */
export class FoxStore {
  private items: FoxSighting[] = [];
  private nextId = 1;

  constructor(initial: Omit<FoxSighting, "id">[] = seed) {
    for (const item of initial) {
      this.items.push({ ...item, id: this.nextId++ });
    }
  }

  list(): FoxSighting[] {
    return [...this.items].sort((a, b) => b.seenAt.localeCompare(a.seenAt));
  }

  get(id: number): FoxSighting | undefined {
    return this.items.find((item) => item.id === id);
  }

  add(input: NewFoxSighting): FoxSighting {
    const sighting: FoxSighting = {
      id: this.nextId++,
      name: input.name.trim(),
      location: input.location.trim(),
      note: (input.note ?? "").trim(),
      seenAt: new Date().toISOString(),
    };
    this.items.push(sighting);
    return sighting;
  }
}

export function validateNewSighting(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof body !== "object" || body === null) {
    return [{ field: "body", message: "Request body must be a JSON object." }];
  }
  const record = body as Record<string, unknown>;

  const name = record.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    errors.push({ field: "name", message: "Name is required." });
  }

  const location = record.location;
  if (typeof location !== "string" || location.trim().length === 0) {
    errors.push({ field: "location", message: "Location is required." });
  }

  if (record.note !== undefined && typeof record.note !== "string") {
    errors.push({ field: "note", message: "Note must be a string." });
  }

  return errors;
}
