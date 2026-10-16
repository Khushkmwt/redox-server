import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";

beforeEach(() => {
  store.flushAll();
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("TTL and Expiration", () => {
  it("TTL returns -2 for non-existent key", () => {
    expect(run(["TTL", "missing"])).toBe(":-2\r\n");
    expect(run(["PTTL", "missing"])).toBe(":-2\r\n");
  });

  it("TTL returns -1 for key without expiration", () => {
    run(["SET", "permanent", "val"]);
    expect(run(["TTL", "permanent"])).toBe(":-1\r\n");
    expect(run(["PTTL", "permanent"])).toBe(":-1\r\n");
  });

  it("EXPIRE sets TTL and TTL returns remaining seconds", () => {
    run(["SET", "k1", "v1"]);
    expect(run(["EXPIRE", "k1", "10"])).toBe(":1\r\n");

    const ttlRes = run(["TTL", "k1"]);
    const val = parseInt(ttlRes.slice(1, -2), 10);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThanOrEqual(10);
  });

  it("PERSIST removes expiration from a key", () => {
    run(["SET", "temp", "val"]);
    run(["EXPIRE", "temp", "60"]);
    expect(run(["PERSIST", "temp"])).toBe(":1\r\n");
    expect(run(["TTL", "temp"])).toBe(":-1\r\n");

    // PERSIST on key without TTL returns 0
    expect(run(["PERSIST", "temp"])).toBe(":0\r\n");
  });

  it("lazy expiration purges key on access", async () => {
    run(["SET", "shortLived", "quick"]);
    // Expire in 20ms
    expect(run(["PEXPIRE", "shortLived", "20"])).toBe(":1\r\n");

    // Wait 30ms so it expires
    await new Promise((r) => setTimeout(r, 30));

    // Accessing key should return null bulk string and purge
    expect(run(["GET", "shortLived"])).toBe("$-1\r\n");
    expect(run(["EXISTS", "shortLived"])).toBe(":0\r\n");
    expect(store.expiredKeysCount).toBeGreaterThan(0);
  });

  it("active expiration worker sweeps expired keys in background", async () => {
    run(["SET", "auto1", "val"]);
    run(["SET", "auto2", "val"]);
    run(["PEXPIRE", "auto1", "20"]);
    run(["PEXPIRE", "auto2", "20"]);

    await new Promise((r) => setTimeout(r, 30));

    // Run active tick manually to verify sweep
    const purged = store.activeExpiryTick();
    expect(purged).toBe(2);
    expect(store.size()).toBe(0);
  });

  it("SET with EX option sets atomic expiration in seconds", async () => {
    expect(run(["SET", "session", "xyz", "EX", "1"])).toBe("+OK\r\n");

    const ttlRes = run(["TTL", "session"]);
    expect(parseInt(ttlRes.slice(1, -2), 10)).toBe(1);

    await new Promise((r) => setTimeout(r, 1100));

    expect(run(["GET", "session"])).toBe("$-1\r\n");
  });

  it("SET with PX option sets atomic expiration in milliseconds", async () => {
    expect(run(["SET", "token", "abc", "PX", "50"])).toBe("+OK\r\n");

    await new Promise((r) => setTimeout(r, 60));

    expect(run(["GET", "token"])).toBe("$-1\r\n");
  });
});
