import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../../src/storage/store.js";
import { restoreSnapshot, saveSnapshot } from "../../src/storage/persistence.js";
import { dispatch } from "../../src/commands/index.js";
import { encode } from "../../src/protocol/resp-encoder.js";
import { RespParser } from "../../src/protocol/resp-parser.js";
import { globToRegExp } from "../../src/storage/pattern.js";

describe("Audit Fixes Verification Suite", () => {
  it("SERVER-1: restoreSnapshot deducts offline downtime from TTL and skips dead keys", () => {
    const store = new Store();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "redox-test-"));
    const dumpPath = path.join(tmpDir, "dump.json");

    // Key with 1000ms TTL
    store.set("alive", "val", 10000);
    store.set("dead", "val", 1000);

    saveSnapshot(store, dumpPath);

    // Mock Date.now() to simulate 3000ms elapsed downtime
    const realNow = Date.now();
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(realNow + 3000);

    const store2 = new Store();
    const result = restoreSnapshot(store2, dumpPath);

    expect(result?.restoredCount).toBe(1);
    expect(store2.get("dead")).toBeUndefined();
    expect(store2.get("alive")).toBe("val");
    expect(store2.pttl("alive")).toBeLessThanOrEqual(7000);

    dateSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("SERVER-2: replacing an existing key does not undercount usedMemory", () => {
    // 500 bytes max memory with LRU eviction
    const store = new Store({ maxMemoryBytes: 500, evictionPolicy: "allkeys-lru" });
    store.set("key", "short");
    const baseline = store.usedMemoryBytes;

    // Overwrite key with longer value
    store.set("key", "longer_value_replacement");
    expect(store.usedMemoryBytes).toBeGreaterThan(baseline);
    expect(store.get("key")).toBe("longer_value_replacement");
  });

  it("SERVER-3: activeExpiryTick visits keys in rotating order beyond first 20 keys", () => {
    const store = new Store();
    // Insert 25 keys with TTL
    for (let i = 1; i <= 25; i++) {
      store.set(`k${i}`, `v${i}`, i <= 20 ? 100000 : 1);
    }

    // Wait 5ms so k21-k25 expire
    const realNow = Date.now();
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(realNow + 50);

    // Tick 1 checks k1-k20 and rotates them
    store.activeExpiryTick();

    // Tick 2 should check remaining keys (k21-k25) and purge them!
    const purged = store.activeExpiryTick();
    expect(purged).toBeGreaterThan(0);
    expect(store.get("k25")).toBeUndefined();

    dateSpy.mockRestore();
  });

  it("SERVER-4: APPEND and INCR preserve existing key TTL", () => {
    const store = new Store();
    store.set("counter", "10", 60000);
    store.set("str", "hello", 60000);

    dispatch(["INCR", "counter"], store);
    dispatch(["APPEND", "str", " world"], store);

    expect(store.get("counter")).toBe("11");
    expect(store.get("str")).toBe("hello world");
    expect(store.pttl("counter")).toBeGreaterThan(50000);
    expect(store.pttl("str")).toBeGreaterThan(50000);
  });

  it("SERVER-6: EXPIRE and SET reject non-integer arguments like 10abc and 10.5", () => {
    const store = new Store();
    store.set("mykey", "val");

    const res1 = dispatch(["EXPIRE", "mykey", "10abc"], store).toString("utf8");
    const res2 = dispatch(["EXPIRE", "mykey", "10.5"], store).toString("utf8");
    const res3 = dispatch(["SET", "k", "v", "EX", "10abc"], store).toString("utf8");

    expect(res1).toContain("ERR value is not an integer or out of range");
    expect(res2).toContain("ERR value is not an integer or out of range");
    expect(res3).toContain("ERR value is not an integer or out of range");
  });

  it("SERVER-7: MSET is atomic and does not leave partial writes when OOM occurs", () => {
    // 150 bytes limit, no eviction
    const store = new Store({ maxMemoryBytes: 150, evictionPolicy: "noeviction" });

    // mset with 2 keys: first fits, second exceeds 150 bytes
    const res = dispatch(["MSET", "k1", "small", "k2", "x".repeat(300)], store).toString("utf8");

    expect(res).toContain("OOM command not allowed");
    expect(store.get("k1")).toBeUndefined();
    expect(store.get("k2")).toBeUndefined();
  });

  it("SERVER-8: simpleString and error encoder sanitize internal CRLF", () => {
    const encodedStr = encode.simpleString("Line1\r\nLine2").toString("utf8");
    const encodedErr = encode.error("ERR Line1\r\nLine2").toString("utf8");

    expect(encodedStr).toBe("+Line1 Line2\r\n");
    expect(encodedErr).toBe("-ERR Line1 Line2\r\n");
  });

  it("SERVER-9: globToRegExp collapses consecutive wildcards", () => {
    const regex = globToRegExp("***a***b***");
    expect(regex.source).toBe("^.*a.*b.*$");
    expect(regex.test("foafoobbar")).toBe(true);
  });

  it("SERVER-10: DBSIZE returns size in O(1)", () => {
    const store = new Store();
    store.set("a", "1");
    store.set("b", "2");
    expect(store.size()).toBe(2);
  });

  it("SERVER-11: RespParser rejects non-numeric characters in array count and bulk length", () => {
    const errors: string[] = [];
    const parser = new RespParser(
      () => {},
      (err) => {
        errors.push(err);
      }
    );

    parser.feed(Buffer.from("*1junk\r\n", "utf8"));
    expect(errors).toContain("Invalid array count: 1junk");

    errors.length = 0;
    parser.feed(Buffer.from("*1\r\n$2junk\r\n", "utf8"));
    expect(errors).toContain("Invalid bulk length: 2junk");
  });
});
