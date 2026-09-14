import { describe, expect, it } from "vitest";
import { isAppleMobile, isStandaloneDisplay } from "../src/display";

describe("display mode", () => {
  it("распознаёт iPhone", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });

  it("распознаёт окно с экрана Домой", () => {
    expect(isStandaloneDisplay({ matches: true }, {})).toBe(true);
    expect(isStandaloneDisplay({ matches: false }, { standalone: true })).toBe(true);
    expect(isStandaloneDisplay({ matches: false }, {})).toBe(false);
  });
});
