import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { store } from "../../src/storage/store.js";
import { saveSnapshot, restoreSnapshot } from "../../src/storage/persistence.js";

describe("persistence (snapshot save & restore)", () => {
  let testDumpPath: string;

  beforeEach(() => {
    store.flushAll();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "redox-test-"));
    testDumpPath = path.join(tmpDir, "dump.json");
  });

  afterEach(() => {
    store.flushAll();
    try {
      const dir = path.dirname(testDumpPath);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns null when dump file does not exist", () => {
    const res = restoreSnapshot(store, testDumpPath);
    expect(res).toBeNull();
  });

  it("saves strings and hashes and restores them accurately", () => {
    store.set("user:name", "Alice");
    store.set("counter", "42");
    store.hset("user:profile", [
      ["email", "alice@example.com"],
      ["role", "admin"],
    ]);

    const saveResult = saveSnapshot(store, testDumpPath);
    expect(saveResult.keyCount).toBe(3);
    expect(saveResult.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(testDumpPath)).toBe(true);

    // Flush store in memory
    store.flushAll();
    expect(store.keys("*")).toHaveLength(0);

    // Restore
    const restoreResult = restoreSnapshot(store, testDumpPath);
    expect(restoreResult).not.toBeNull();
    expect(restoreResult!.restoredCount).toBe(3);

    // Verify restored data
    expect(store.get("user:name")).toBe("Alice");
    expect(store.get("counter")).toBe("42");
    expect(store.type("user:profile")).toBe("hash");
    expect(store.hget("user:profile", "email")).toBe("alice@example.com");
    expect(store.hget("user:profile", "role")).toBe("admin");
  });

  it("preserves remaining TTLs across snapshot save and restore", () => {
    store.set("expiring_string", "temp_value", 60_000); // 60s TTL
    store.hset("expiring_hash", [["f", "v"]]);
    store.pexpire("expiring_hash", 60_000);

    saveSnapshot(store, testDumpPath);
    store.flushAll();

    restoreSnapshot(store, testDumpPath);

    expect(store.get("expiring_string")).toBe("temp_value");
    const strTtl = store.ttl("expiring_string");
    expect(strTtl).toBeGreaterThan(0);
    expect(strTtl).toBeLessThanOrEqual(60);

    expect(store.hget("expiring_hash", "f")).toBe("v");
    const hashTtl = store.ttl("expiring_hash");
    expect(hashTtl).toBeGreaterThan(0);
    expect(hashTtl).toBeLessThanOrEqual(60);
  });

  it("handles empty store snapshot", () => {
    const saveResult = saveSnapshot(store, testDumpPath);
    expect(saveResult.keyCount).toBe(0);

    const restoreResult = restoreSnapshot(store, testDumpPath);
    expect(restoreResult).not.toBeNull();
    expect(restoreResult!.restoredCount).toBe(0);
  });
});
