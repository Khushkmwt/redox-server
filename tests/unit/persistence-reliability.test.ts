import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../../src/storage/store.js";
import { saveSnapshot, restoreSnapshot } from "../../src/storage/persistence.js";
import { dispatch } from "../../src/commands/index.js";

describe("Persistence Reliability Suite (R3, R4, R5)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "redox-persist-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("R5: saveSnapshot does not modify lastAccessedAt timestamps", async () => {
    const store = new Store();
    store.set("strKey", "val");
    store.hset("hashKey", [["field", "data"]]);
    store.lpush("listKey", ["item"]);
    store.sadd("setKey", ["member"]);

    // Record baseline lastAccessedAt timestamps
    const rawEntries = store.exportSnapshotEntries();
    expect(rawEntries).toHaveLength(4);

    // Sleep 15ms so current time advances
    await new Promise((r) => setTimeout(r, 15));

    const dumpPath = path.join(tmpDir, "dump.json");
    saveSnapshot(store, dumpPath);

    // Verify lastAccessedAt timestamps were NOT updated by saveSnapshot
    for (const key of ["strKey", "hashKey", "listKey", "setKey"]) {
      const entry = (store as unknown as { data: Map<string, { lastAccessedAt: number }> }).data.get(key);
      expect(entry).toBeDefined();
      // Access timestamp must be in the past before our 15ms sleep
      expect(Date.now() - entry!.lastAccessedAt).toBeGreaterThanOrEqual(10);
    }
  });

  it("R3: restoreSnapshot rejects invalid snapshot schema and preserves existing store state", () => {
    const store = new Store();
    store.set("existing", "untouched");

    const dumpPath = path.join(tmpDir, "dump_bad.json");
    // Invalid schema: version 99 and invalid entry type
    const malformed = {
      version: 99,
      savedAt: Date.now(),
      entries: [{ key: "bad", type: "unknown_type" }],
    };
    fs.writeFileSync(dumpPath, JSON.stringify(malformed), "utf8");

    expect(() => restoreSnapshot(store, dumpPath)).toThrow(/Unsupported snapshot version/);
    // Live store must remain completely intact
    expect(store.get("existing")).toBe("untouched");
  });

  it("R3: restoreSnapshot is atomic and does not leave partial database if OOM occurs", () => {
    const store = new Store({ maxMemoryBytes: 100, evictionPolicy: "noeviction" });
    store.set("baseline", "safe");

    const dumpPath = path.join(tmpDir, "dump_oom.json");
    // Entry 1 fits (50 bytes), entry 2 is giant (300 bytes)
    const snapshotData = {
      version: 1,
      savedAt: Date.now(),
      entries: [
        { key: "k1", type: "string", value: "fits" },
        { key: "k2", type: "string", value: "x".repeat(300) },
      ],
    };
    fs.writeFileSync(dumpPath, JSON.stringify(snapshotData), "utf8");

    expect(() => restoreSnapshot(store, dumpPath)).toThrow(/OOM/);
    // Live store was not partially overwritten with k1
    expect(store.get("k1")).toBeUndefined();
    expect(store.get("baseline")).toBe("safe");
  });

  it("R4: flushall reports error if snapshot deletion fails", () => {
    const store = new Store();
    store.set("k", "v");

    const dumpPath = path.join(tmpDir, "dump_protected.json");
    process.env.DUMP_PATH = dumpPath;
    fs.writeFileSync(dumpPath, "{}");

    // Mock fs.unlinkSync to simulate permissions / I/O error
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const res = dispatch(["FLUSHALL"], store).toString();
    expect(res).toContain("-ERR persistence failure during FLUSHALL: EACCES: permission denied");

    unlinkSpy.mockRestore();
    delete process.env.DUMP_PATH;
  });
});
