import { describe, expect, it } from "vitest";
import { businessDate, dateRangeForPreset } from "./time";

describe("Pacific/Auckland business dates", () => {
  it("uses Auckland rather than the browser timezone", () => {
    expect(businessDate(new Date("2026-09-26T12:30:00Z"))).toBe("2026-09-27");
  });

  it("creates inclusive seven-day filters", () => {
    expect(dateRangeForPreset("last7", new Date("2026-09-26T01:00:00Z"))).toEqual({ from: "2026-09-20", to: "2026-09-26" });
  });
});
