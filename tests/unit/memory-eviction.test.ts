import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";

beforeEach(() => {
  store.flushAll();
  store.maxMemory = 0; // unlimited by default
  store.evictionPolicy = "noeviction";
});

function run(cmd: string[]): string {
  return dispatch(cmd, store).toString();
}

describe("Memory tracking & INFO", () => {
  it("tracks memory when keys are added and removed", () => {
    expect(store.usedMemoryBytes).toBe(0);

    store.set("user", "Alice");
    const memAfterSet = store.usedMemoryBytes;
    expect(memAfterSet).toBeGreaterThan(0);

    store.del("user");
    expect(store.usedMemoryBytes).toBe(0);
  });

  it("INFO command returns memory metrics", () => {
    store.set("a", "1");
    const res = run(["INFO", "memory"]);
    expect(res).toContain("# Memory");
    expect(res).toContain("used_memory:");
    expect(res).toContain("maxmemory:");
    expect(res).toContain("maxmemory_policy:noeviction");
  });
});

describe("Memory eviction policies", () => {
  it("noeviction rejects writes when memory cap is reached", () => {
    // Set a very small cap of 100 bytes
    store.maxMemory = 100;
    store.evictionPolicy = "noeviction";

    store.set("k1", "small");
    expect(store.usedMemoryBytes).toBeLessThanOrEqual(100);

    // Write a key that exceeds the 100-byte cap
    const errRes = run(["SET", "k2", "this_is_a_longer_value_that_exceeds_cap"]);
    expect(errRes).toContain("-OOM command not allowed when used memory > 'maxmemory'");

    // Reads and deletes should still work
    expect(run(["GET", "k1"])).toBe("$5\r\nsmall\r\n");
    expect(run(["DEL", "k1"])).toBe(":1\r\n");
  });

  it("allkeys-lru evicts least recently accessed keys", async () => {
    // Set maxMemory to 80 bytes (each key is 36 bytes, so 3 keys = 108 bytes exceeds cap)
    store.maxMemory = 80;
    store.evictionPolicy = "allkeys-lru";

    run(["SET", "k1", "v1"]);
    await new Promise((r) => setTimeout(r, 10));

    run(["SET", "k2", "v2"]);
    await new Promise((r) => setTimeout(r, 10));

    // Access k1 so k2 becomes the least recently used
    run(["GET", "k1"]);
    await new Promise((r) => setTimeout(r, 10));

    // Setting k3 should evict k2 (the LRU key), keeping k1 and k3
    run(["SET", "k3", "v3"]);

    expect(store.evictedKeysCount).toBeGreaterThan(0);
    expect(run(["GET", "k1"])).toContain("v1");
    expect(run(["GET", "k2"])).toBe("$-1\r\n"); // evicted!
    expect(run(["GET", "k3"])).toContain("v3");
  });

  it("R2: failed write under allkeys-lru does not evict unrelated keys (transactional)", () => {
    store.maxMemory = 100;
    store.evictionPolicy = "allkeys-lru";

    store.set("keep1", "val1");
    store.set("keep2", "val2");

    // Write a key that is larger than the entire maxMemory (impossible to fit even if all keys are evicted)
    const res = run(["SET", "giant", "x".repeat(200)]);
    expect(res).toContain("-OOM command not allowed");

    // Existing keys must still exist intact!
    expect(store.get("keep1")).toBe("val1");
    expect(store.get("keep2")).toBe("val2");
    expect(store.evictedKeysCount).toBe(0);
  });

  it("R2: multi-key MSET with new keys evicts eligible keys and succeeds", () => {
    store.maxMemory = 120;
    store.evictionPolicy = "allkeys-lru";

    store.set("old1", "v1");
    store.set("old2", "v2");

    // MSET with 3 new keys (3 > current key count of 2)
    const res = run(["MSET", "new1", "a", "new2", "b"]);
    expect(res).toBe("+OK\r\n");
    expect(store.get("new1")).toBe("a");
    expect(store.get("new2")).toBe("b");
  });
});
