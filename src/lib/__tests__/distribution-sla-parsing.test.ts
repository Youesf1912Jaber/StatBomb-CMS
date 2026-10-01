import { describe, it, expect } from "vitest";
import { parseDistributionSla } from "@/lib/distribution-assignments";

describe("parseDistributionSla", () => {
  describe("MM/DD/YYYY HH:MM:SS format (Google Sheets Distribution)", () => {
    it("parses 10/1/2026 19:35:00 as October 1, 2026 19:35 Cairo time", () => {
      const result = parseDistributionSla("10/1/2026 19:35:00");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(9); // October (0-indexed)
        expect(date.getUTCDate()).toBe(1);
        // 19:35 Cairo (+03:00) → 16:35 UTC
        expect(date.getUTCHours()).toBe(16);
        expect(date.getUTCMinutes()).toBe(35);
        expect(date.getUTCSeconds()).toBe(0);
      }
    });

    it("parses 9/30/2026 10:15:00 as September 30, 2026 10:15 Cairo time", () => {
      const result = parseDistributionSla("9/30/2026 10:15:00");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(8); // September (0-indexed)
        expect(date.getUTCDate()).toBe(30);
        // 10:15 Cairo (+03:00) → 07:15 UTC
        expect(date.getUTCHours()).toBe(7);
        expect(date.getUTCMinutes()).toBe(15);
        expect(date.getUTCSeconds()).toBe(0);
      }
    });

    it("future SLA (19:35 on Oct 1, 2026) is NOT overdue when current time is Oct 1, 2026 15:36", () => {
      const slaResult = parseDistributionSla("10/1/2026 19:35:00");
      expect(slaResult).toBeTruthy();
      if (slaResult) {
        const slaMs = new Date(slaResult).getTime();
        // Mock current time as Oct 1, 2026 15:36 Cairo = 12:36 UTC
        const mockNowUTC = new Date("2026-10-01T12:36:00Z").getTime();
        const remainingMs = slaMs - mockNowUTC;

        // Should have ~3h 59m remaining
        const remainingHours = remainingMs / (1000 * 60 * 60);
        expect(remainingHours).toBeGreaterThan(3.5);
        expect(remainingHours).toBeLessThan(4.5);
        expect(remainingMs).toBeGreaterThan(0); // NOT overdue
      }
    });

    it("parses date with seconds: 10/1/2026 19:35:42", () => {
      const result = parseDistributionSla("10/1/2026 19:35:42");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCSeconds()).toBe(42);
      }
    });

    it("handles day > 12 unambiguously: 15/10/2026 should fail (invalid month)", () => {
      // Note: 15/10/2026 in MM/DD would be invalid (month 15), so parser should handle this gracefully
      // If the API ever sends this, it should fail to parse (correct behavior)
      const result = parseDistributionSla("15/10/2026 10:00:00");
      // This should return null because month 15 is invalid
      expect(result).toBeNull();
    });

    it("parses ISO format with Cairo offset: 2026-10-01T19:35:00+03:00", () => {
      const result = parseDistributionSla("2026-10-01T19:35:00+03:00");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(9); // October
        expect(date.getUTCDate()).toBe(1);
        expect(date.getUTCHours()).toBe(16); // 19:35 +03:00 → 16:35 UTC
        expect(date.getUTCMinutes()).toBe(35);
      }
    });

    it("returns null for empty/invalid SLA", () => {
      expect(parseDistributionSla("")).toBeNull();
      expect(parseDistributionSla(null)).toBeNull();
      expect(parseDistributionSla("invalid date")).toBeNull();
    });

    it("handles time-only format with fallback date: 19:35:00 with fallback 10/1/2026", () => {
      const result = parseDistributionSla("19:35:00", "10/1/2026");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(9); // October
        expect(date.getUTCDate()).toBe(1);
        expect(date.getUTCHours()).toBe(16); // 19:35 Cairo → 16:35 UTC
      }
    });
  });

  describe("regression: ensure ambiguous dates treated as MM/DD", () => {
    it("1/2/2026 is January 2, NOT February 1", () => {
      const result = parseDistributionSla("1/2/2026 10:00:00");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCMonth()).toBe(0); // January
        expect(date.getUTCDate()).toBe(2);
      }
    });

    it("2/1/2026 is February 1, NOT January 2", () => {
      const result = parseDistributionSla("2/1/2026 10:00:00");
      expect(result).toBeTruthy();
      if (result) {
        const date = new Date(result);
        expect(date.getUTCMonth()).toBe(1); // February
        expect(date.getUTCDate()).toBe(1);
      }
    });
  });
});
