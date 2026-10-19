import fs from "node:fs";
import path from "node:path";
import type { Store } from "./store.js";

export interface SnapshotData {
  version: number;
  savedAt: number;
  entries: SnapshotEntry[];
}

export type SnapshotEntry =
  | {
      key: string;
      type: "string";
      value: string;
      ttlMsRemaining?: number;
    }
  | {
      key: string;
      type: "hash";
      fields: Record<string, string>;
      ttlMsRemaining?: number;
    };

export function getDefaultDumpPath(): string {
  return process.env.DUMP_PATH ?? path.join(process.cwd(), "data", "dump.json");
}

/**
 * Save an atomic point-in-time snapshot of the in-memory store to disk.
 * Uses atomic rename to prevent file corruption.
 */
export function saveSnapshot(
  store: Store,
  filePath = getDefaultDumpPath()
): { keyCount: number; bytes: number } {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const keys = store.keys("*");
  const entries: SnapshotEntry[] = [];

  for (const key of keys) {
    const keyType = store.type(key);
    const ttlMs = store.pttl(key);
    const ttlMsRemaining = ttlMs > 0 ? ttlMs : undefined;

    if (keyType === "string") {
      const val = store.get(key);
      if (val !== undefined) {
        entries.push({ key, type: "string", value: val, ttlMsRemaining });
      }
    } else if (keyType === "hash") {
      const pairs = store.hgetall(key);
      entries.push({
        key,
        type: "hash",
        fields: Object.fromEntries(pairs),
        ttlMsRemaining,
      });
    }
  }

  const snapshot: SnapshotData = {
    version: 1,
    savedAt: Date.now(),
    entries,
  };

  const json = JSON.stringify(snapshot, null, 2);
  const tempPath = `${filePath}.tmp.${Date.now()}`;

  fs.writeFileSync(tempPath, json, "utf8");
  fs.renameSync(tempPath, filePath);

  store.lastSaveTimestamp = Math.floor(snapshot.savedAt / 1000);

  return { keyCount: entries.length, bytes: Buffer.byteLength(json, "utf8") };
}

/**
 * Restore store state from a snapshot file if it exists.
 */
export function restoreSnapshot(
  store: Store,
  filePath = getDefaultDumpPath()
): { restoredCount: number; elapsedMs: number } | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const start = performance.now();
  const raw = fs.readFileSync(filePath, "utf8");
  const snapshot = JSON.parse(raw) as SnapshotData;

  let restoredCount = 0;
  const now = Date.now();
  const elapsedDowntime = Math.max(0, now - snapshot.savedAt);

  for (const item of snapshot.entries) {
    let effectiveTtl: number | undefined;
    if (item.ttlMsRemaining !== undefined) {
      effectiveTtl = item.ttlMsRemaining - elapsedDowntime;
      if (effectiveTtl <= 0) {
        // Key expired while server was offline
        continue;
      }
    }

    if (item.type === "string") {
      store.set(item.key, item.value, effectiveTtl);
      restoredCount++;
    } else if (item.type === "hash") {
      const fieldPairs = Object.entries(item.fields);
      if (fieldPairs.length > 0) {
        store.hset(item.key, fieldPairs);
        if (effectiveTtl !== undefined) {
          store.pexpire(item.key, effectiveTtl);
        }
        restoredCount++;
      }
    }
  }

  store.lastSaveTimestamp = Math.floor(snapshot.savedAt / 1000);

  const elapsedMs = performance.now() - start;
  return { restoredCount, elapsedMs };
}
