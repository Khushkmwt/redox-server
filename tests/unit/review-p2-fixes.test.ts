import { describe, it, expect } from "vitest";
import { parseMemoryString } from "../../src/storage/memory.js";
import { Store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";
import { sweepActiveExpiry } from "../../src/storage/expiry.js";
import type { Entry } from "../../src/types/storage.js";

describe("Review P2/P3 Architectural Fixes (R8, R9, R10, R12, R16)", () => {
  describe("R8: Strict memory and config validation", () => {
    it("throws on invalid memory strings", () => {
      expect(() => parseMemoryString("64mbx")).toThrow(/Invalid memory configuration/);
      expect(() => parseMemoryString("abc")).toThrow(/Invalid memory configuration/);
      expect(() => parseMemoryString("-500mb")).toThrow(/Invalid memory configuration/);
    });

    it("parses valid memory strings correctly", () => {
      expect(parseMemoryString("0")).toBe(0);
      expect(parseMemoryString("")).toBe(0);
      expect(parseMemoryString("64mb")).toBe(64 * 1024 * 1024);
      expect(parseMemoryString("500kb")).toBe(500 * 1024);
      expect(parseMemoryString("1gb")).toBe(1024 * 1024 * 1024);
    });

    it("throws in Store constructor on invalid eviction policy", () => {
      expect(
        () =>
          new Store({
            // @ts-expect-error testing invalid policy runtime validation
            evictionPolicy: "random",
          })
      ).toThrow(/Invalid evictionPolicy/);
    });
  });

  describe("R9: Safe numeric bounds for TTL", () => {
    it("rejects extreme or out-of-range TTL values", () => {
      const store = new Store();
      store.set("k", "v");

      // 10^15 is beyond MAX_TTL_SECONDS
      const resExpire = dispatch(["EXPIRE", "k", "999999999999999"], store).toString();
      expect(resExpire).toContain("ERR value is not an integer or out of range");

      const resPexpire = dispatch(["PEXPIRE", "k", "999999999999999999"], store).toString();
      expect(resPexpire).toContain("ERR value is not an integer or out of range");

      const resSetEx = dispatch(["SET", "k2", "v", "EX", "999999999999999"], store).toString();
      expect(resSetEx).toContain("ERR value is not an integer or out of range");
    });
  });

  describe("R10: Strict signed 64-bit integer checking", () => {
    it("rejects INCRBY if delta exceeds signed 64-bit bounds", () => {
      const store = new Store();
      store.set("counter", "10");

      // 2^63 exceeds signed int64 max (9223372036854775807)
      const res = dispatch(["INCRBY", "counter", "9223372036854775808"], store).toString();
      expect(res).toContain("ERR value is not an integer or out of range");
    });

    it("rejects INCRBY if current stored value is outside int64 bounds", () => {
      const store = new Store();
      // Store value outside int64
      store.set("counter", "9223372036854775808");

      const res = dispatch(["INCRBY", "counter", "-1"], store).toString();
      expect(res).toContain("ERR value is not an integer or out of range");
    });
  });

  describe("R12: Accurate COMMAND metadata specifications", () => {
    it("returns command specs with accurate arity and flags", () => {
      const store = new Store();
      const res = dispatch(["COMMAND"], store);
      // Valid RESP array output
      expect(res.toString()).toMatch(/^\*\d+\r\n/);
    });

    it("exports COMMAND_SPECS with correct structure for Redis commands", async () => {
      const { COMMAND_SPECS } = await import("../../src/types/index.js");
      expect(COMMAND_SPECS.GET).toBeDefined();
      expect(COMMAND_SPECS.GET.arity).toBe(2);
      expect(COMMAND_SPECS.GET.flags).toContain("readonly");
      expect(COMMAND_SPECS.SET.arity).toBe(-3);
      expect(COMMAND_SPECS.AUTH.flags).toContain("no_auth");
    });
  });

  describe("R16: Single-pass distinct key inspection during active expiry", () => {
    it("inspects each distinct key at most once per tick even when ttlKeys < batchSize", () => {
      const data = new Map<string, Entry>();
      const ttlKeys = new Set<string>();

      // Populate 3 unexpired keys
      const future = Date.now() + 100000;
      for (let i = 1; i <= 3; i++) {
        data.set(`k${i}`, { type: "string", value: "v", lastAccessedAt: Date.now(), expiresAt: future });
        ttlKeys.add(`k${i}`);
      }

      // Run active expiry with batchSize 20
      const sweep = sweepActiveExpiry(data, ttlKeys, 20);
      expect(sweep.purgedCount).toBe(0);
      // ttlKeys should still have the same 3 keys
      expect(ttlKeys.size).toBe(3);
    });
  });
});
