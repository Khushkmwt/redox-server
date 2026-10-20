import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../../src/storage/store.js";
import { saveSnapshot, restoreSnapshot } from "../../src/storage/persistence.js";

describe("Collections Persistence Suite (Lists & Sets)", () => {
  let store: Store;
  let tempDumpPath: string;

  beforeEach(() => {
    store = new Store();
    tempDumpPath = path.join(
      os.tmpdir(),
      `redox-test-collections-dump-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDumpPath)) {
      fs.unlinkSync(tempDumpPath);
    }
  });

  it("saves and restores lists and sets with TTL", () => {
    // Populate store with mixed types
    store.set("str1", "hello");
    store.hset("hash1", [
      ["field1", "val1"],
      ["field2", "val2"],
    ]);
    store.rpush("list1", ["item1", "item2", "item3"]);
    store.sadd("set1", ["apple", "banana", "cherry"]);

    // Set TTL on list1
    store.pexpire("list1", 60000);

    // Save snapshot
    const saveRes = saveSnapshot(store, tempDumpPath);
    expect(saveRes.keyCount).toBe(4);

    // Create a new fresh store and restore
    const freshStore = new Store();
    const restoreRes = restoreSnapshot(freshStore, tempDumpPath);
    expect(restoreRes?.restoredCount).toBe(4);

    // Validate string and hash
    expect(freshStore.get("str1")).toBe("hello");
    expect(freshStore.hget("hash1", "field1")).toBe("val1");

    // Validate list restoration
    expect(freshStore.type("list1")).toBe("list");
    expect(freshStore.lrange("list1", 0, -1)).toEqual(["item1", "item2", "item3"]);
    expect(freshStore.pttl("list1")).toBeGreaterThan(50000);

    // Validate set restoration
    expect(freshStore.type("set1")).toBe("set");
    expect(freshStore.scard("set1")).toBe(3);
    expect(freshStore.sismember("set1", "apple")).toBe(true);
    expect(freshStore.sismember("set1", "banana")).toBe(true);
    expect(freshStore.sismember("set1", "cherry")).toBe(true);
  });
});
