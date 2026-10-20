import fs from "node:fs";
import path from "node:path";
import type { Store } from "./store.js";

import {
  type SnapshotData,
  type SnapshotEntry,
  type SnapshotSaveResult,
  type SnapshotRestoreResult,
} from "../types/persistence.js";

export type { SnapshotData, SnapshotEntry, SnapshotSaveResult, SnapshotRestoreResult };

export function getDefaultDumpPath(): string {
  return process.env.DUMP_PATH ?? path.join(process.cwd(), "data", "dump.json");
}

type Serializer = (store: Store, key: string, ttlMsRemaining?: number) => SnapshotEntry | null;
type Restorer = (store: Store, item: SnapshotEntry, effectiveTtl?: number) => boolean;

const serializers: Record<string, Serializer> = {
  string: (store, key, ttlMsRemaining) => {
    const val = store.get(key);
    return val !== undefined ? { key, type: "string", value: val, ttlMsRemaining } : null;
  },
  hash: (store, key, ttlMsRemaining) => {
    const pairs = store.hgetall(key);
    return { key, type: "hash", fields: Object.fromEntries(pairs), ttlMsRemaining };
  },
  list: (store, key, ttlMsRemaining) => {
    const elements = store.lrange(key, 0, -1);
    return { key, type: "list", elements, ttlMsRemaining };
  },
  set: (store, key, ttlMsRemaining) => {
    const members = store.smembers(key);
    return { key, type: "set", members, ttlMsRemaining };
  },
};

const restorers: Record<string, Restorer> = {
  string: (store, item, effectiveTtl) => {
    if (item.type !== "string") return false;
    store.set(item.key, item.value, effectiveTtl);
    return true;
  },
  hash: (store, item, effectiveTtl) => {
    if (item.type !== "hash") return false;
    const pairs = Object.entries(item.fields);
    if (pairs.length === 0) return false;
    store.hset(item.key, pairs);
    if (effectiveTtl !== undefined) store.pexpire(item.key, effectiveTtl);
    return true;
  },
  list: (store, item, effectiveTtl) => {
    if (item.type !== "list" || !item.elements?.length) return false;
    store.rpush(item.key, item.elements);
    if (effectiveTtl !== undefined) store.pexpire(item.key, effectiveTtl);
    return true;
  },
  set: (store, item, effectiveTtl) => {
    if (item.type !== "set" || !item.members?.length) return false;
    store.sadd(item.key, item.members);
    if (effectiveTtl !== undefined) store.pexpire(item.key, effectiveTtl);
    return true;
  },
};

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

    const serializer = serializers[keyType];
    if (serializer) {
      const entry = serializer(store, key, ttlMsRemaining);
      if (entry) entries.push(entry);
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

    const restorer = restorers[item.type];
    if (restorer && restorer(store, item, effectiveTtl)) {
      restoredCount++;
    }
  }

  store.lastSaveTimestamp = Math.floor(snapshot.savedAt / 1000);

  const elapsedMs = performance.now() - start;
  return { restoredCount, elapsedMs };
}
