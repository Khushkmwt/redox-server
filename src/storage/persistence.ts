import fs from "node:fs";
import path from "node:path";
import { Store } from "./store.js";

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

type Restorer = (store: Store, item: SnapshotEntry, effectiveTtl?: number) => boolean;

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
 * Validate raw parsed JSON against the strict SnapshotData schema (R3).
 */
export function validateSnapshotData(raw: unknown): SnapshotData {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid snapshot format: expected JSON object");
  }

  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${obj.version}`);
  }

  if (typeof obj.savedAt !== "number" || !Number.isFinite(obj.savedAt) || obj.savedAt <= 0) {
    throw new Error("Invalid snapshot format: savedAt must be a positive finite timestamp");
  }

  if (!Array.isArray(obj.entries)) {
    throw new Error("Invalid snapshot format: entries must be an array");
  }

  for (let i = 0; i < obj.entries.length; i++) {
    const e = obj.entries[i];
    if (!e || typeof e !== "object") {
      throw new Error(`Invalid snapshot entry at index ${i}: expected object`);
    }

    const entry = e as Record<string, unknown>;
    if (typeof entry.key !== "string" || entry.key.length === 0) {
      throw new Error(`Invalid snapshot entry at index ${i}: missing or empty key`);
    }

    if (
      entry.ttlMsRemaining !== undefined &&
      (typeof entry.ttlMsRemaining !== "number" ||
        !Number.isFinite(entry.ttlMsRemaining) ||
        entry.ttlMsRemaining < 0)
    ) {
      throw new Error(`Invalid snapshot entry at index ${i}: ttlMsRemaining must be a positive number`);
    }

    switch (entry.type) {
      case "string":
        if (typeof entry.value !== "string") {
          throw new Error(`Invalid snapshot string entry at index ${i}: value must be string`);
        }
        break;
      case "hash":
        if (!entry.fields || typeof entry.fields !== "object" || Array.isArray(entry.fields)) {
          throw new Error(`Invalid snapshot hash entry at index ${i}: fields must be object map`);
        }
        break;
      case "list":
        if (!Array.isArray(entry.elements)) {
          throw new Error(`Invalid snapshot list entry at index ${i}: elements must be array`);
        }
        break;
      case "set":
        if (!Array.isArray(entry.members)) {
          throw new Error(`Invalid snapshot set entry at index ${i}: members must be array`);
        }
        break;
      default:
        throw new Error(`Invalid snapshot entry at index ${i}: unknown type '${entry.type}'`);
    }
  }

  return obj as unknown as SnapshotData;
}

/**
 * Save an atomic point-in-time snapshot of the in-memory store to disk.
 * Uses atomic rename to prevent file corruption.
 * Reads entries directly without mutating LRU lastAccessedAt (R5).
 */
export function saveSnapshot(
  store: Store,
  filePath = getDefaultDumpPath()
): { keyCount: number; bytes: number } {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const entries = store.exportSnapshotEntries();

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
 * Validates complete snapshot and applies atomically through staging (R3).
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
  const rawJson = JSON.parse(raw);
  const snapshot = validateSnapshotData(rawJson);

  // Staging store: all mutations are performed on an isolated store first (R3)
  const staging = new Store({
    maxMemoryBytes: store.maxMemory,
    evictionPolicy: store.evictionPolicy,
  });

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
    if (restorer && restorer(staging, item, effectiveTtl)) {
      restoredCount++;
    }
  }

  // Atomic state commit: only reached if all entries validated and restored without error
  store.replaceStoreState(staging);
  store.lastSaveTimestamp = Math.floor(snapshot.savedAt / 1000);

  const elapsedMs = performance.now() - start;
  return { restoredCount, elapsedMs };
}
