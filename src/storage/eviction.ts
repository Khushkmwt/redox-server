// Memory limits and LRU key eviction policies.

import type { Entry, EvictionPolicy } from "./types.js";
import { calculateEntryBytes } from "./memory.js";
import { EVICTION_SAMPLE_SIZE } from "../utils/constants.js";

/**
 * Enforce memory limits before applying memory-increasing delta.
 * Uses transactional eviction planning: if the delta cannot fit even after
 * all eligible evictions, no keys are evicted and OOM is thrown.
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

  // Collect all eligible keys currently in store that are not excluded
  const eligibleKeys: string[] = [];
  for (const k of data.keys()) {
    if (!excludeSet?.has(k)) {
      eligibleKeys.push(k);
    }
  }

  if (eligibleKeys.length === 0) {
    throw new Error("OOM command not allowed when used memory > 'maxmemory'");
  }

  const plannedEvictions: string[] = [];
  let plannedFreed = 0;
  const simulatedExcluded = new Set<string>();

  // Plan eviction candidates until memory limit will be satisfied
  while (
    usedMemory - plannedFreed + deltaBytes > maxMemory &&
    simulatedExcluded.size < eligibleKeys.length
  ) {
    const remainingCandidates = eligibleKeys.filter((k) => !simulatedExcluded.has(k));
    if (remainingCandidates.length === 0) break;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    const sampleCount = Math.min(remainingCandidates.length, EVICTION_SAMPLE_SIZE);

    if (remainingCandidates.length <= EVICTION_SAMPLE_SIZE) {
      for (const k of remainingCandidates) {
        const entry = data.get(k)!;
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = k;
        }
      }
    } else {
      // Uniform random sampling across eligible keys
      const sampledIndices = new Set<number>();
      while (sampledIndices.size < sampleCount) {
        const idx = Math.floor(Math.random() * remainingCandidates.length);
        sampledIndices.add(idx);
      }
      for (const idx of sampledIndices) {
        const k = remainingCandidates[idx];
        const entry = data.get(k)!;
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = k;
        }
      }
    }

    if (!oldestKey) break;

    simulatedExcluded.add(oldestKey);
    plannedEvictions.push(oldestKey);
    const entry = data.get(oldestKey)!;
    plannedFreed += calculateEntryBytes(oldestKey, entry);
  }

  // Transactional guard: if even after all possible evictions it still cannot fit,
  // do NOT evict any keys.
  if (usedMemory - plannedFreed + deltaBytes > maxMemory) {
    throw new Error("OOM command not allowed when used memory > 'maxmemory'");
  }

  // Commit planned evictions
  for (const key of plannedEvictions) {
    data.delete(key);
    ttlKeys.delete(key);
  }

  return { freedBytes: plannedFreed, evictedCount: plannedEvictions.length };
}
