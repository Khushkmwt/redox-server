// Memory limits and LRU key eviction policies.

import type { Entry, EvictionPolicy } from "./types.js";
import { calculateEntryBytes } from "./memory.js";
import { EVICTION_SAMPLE_SIZE } from "../utils/constants.js";

/**
 * Enforce memory limits before applying memory-increasing delta.
 * If maxmemory is exceeded and policy is allkeys-lru, evicts keys until within limits.
 */
export function evictForMemoryDelta(
  data: Map<string, Entry>,
  ttlKeys: Set<string>,
  usedMemory: number,
  maxMemory: number,
  deltaBytes: number,
  policy: EvictionPolicy,
  excludeKeys?: string | Set<string>
): { freedBytes: number; evictedCount: number } {
  if (maxMemory <= 0 || deltaBytes <= 0) {
    return { freedBytes: 0, evictedCount: 0 };
  }

  if (deltaBytes > maxMemory) {
    throw new Error("OOM command not allowed when used memory > 'maxmemory'");
  }

  if (usedMemory + deltaBytes <= maxMemory) {
    return { freedBytes: 0, evictedCount: 0 };
  }

  if (policy === "noeviction") {
    throw new Error("OOM command not allowed when used memory > 'maxmemory'");
  }

  const excludeSet =
    excludeKeys instanceof Set
      ? excludeKeys
      : excludeKeys
        ? new Set([excludeKeys])
        : null;

  let freedBytes = 0;
  let evictedCount = 0;

  // allkeys-lru: sample keys and evict the oldest accessed
  while (
    usedMemory - freedBytes + deltaBytes > maxMemory &&
    data.size > (excludeSet?.size ?? 0)
  ) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    let sampleCount = 0;
    for (const [k, entry] of data.entries()) {
      if (excludeSet?.has(k)) continue;
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = k;
      }
      if (++sampleCount >= EVICTION_SAMPLE_SIZE) break;
    }

    if (oldestKey) {
      const entry = data.get(oldestKey)!;
      const entryBytes = calculateEntryBytes(oldestKey, entry);
      data.delete(oldestKey);
      ttlKeys.delete(oldestKey);
      freedBytes += entryBytes;
      evictedCount++;
    } else {
      break;
    }
  }

  if (usedMemory - freedBytes + deltaBytes > maxMemory) {
    throw new Error("OOM command not allowed when used memory > 'maxmemory'");
  }

  return { freedBytes, evictedCount };
}
