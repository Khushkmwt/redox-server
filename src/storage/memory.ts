import type { Entry } from "./types.js";

export const KEY_OVERHEAD = 32;
export const HASH_FIELD_OVERHEAD = 16;
export const LIST_ELEMENT_OVERHEAD = 16;
export const SET_MEMBER_OVERHEAD = 16;

/**
 * Parse human memory strings like '64mb', '500kb', '1gb', or raw bytes.
 * Returns bytes as a number (0 = unlimited).
 * Throws on invalid or negative format (R8).
 */
export function parseMemoryString(memStr?: string): number {
  if (!memStr || memStr.trim() === "" || memStr.trim() === "0") return 0;
  const match = memStr.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    throw new Error(`Invalid memory configuration: '${memStr}'`);
  }
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid memory configuration: '${memStr}'`);
  }
  const unit = match[2] || "b";
  let bytes = 0;
  switch (unit) {
    case "kb":
      bytes = Math.round(num * 1024);
      break;
    case "mb":
      bytes = Math.round(num * 1024 * 1024);
      break;
    case "gb":
      bytes = Math.round(num * 1024 * 1024 * 1024);
      break;
    default:
      bytes = Math.round(num);
  }
  if (!Number.isFinite(bytes) || bytes > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid memory configuration: '${memStr}' exceeds maximum safe limit`);
  }
  return bytes;
}

/**
 * Format raw byte counts into clean human-readable strings (e.g. '1.50M', '500.00K').
 */
export function formatBytesHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}G`;
}

/**
 * Compute total estimated bytes used by a key and its entry.
 */
export function calculateEntryBytes(key: string, entry: Entry): number {
  const keyBytes = Buffer.byteLength(key, "utf8") + KEY_OVERHEAD;
  if (entry.type === "string") {
    return keyBytes + Buffer.byteLength(entry.value, "utf8");
  }
  if (entry.type === "list") {
    let total = keyBytes;
    for (const el of entry.elements) {
      total += Buffer.byteLength(el, "utf8") + LIST_ELEMENT_OVERHEAD;
    }
    return total;
  }
  if (entry.type === "set") {
    let total = keyBytes;
    for (const m of entry.members) {
      total += Buffer.byteLength(m, "utf8") + SET_MEMBER_OVERHEAD;
    }
    return total;
  }
  let total = keyBytes;
  for (const [f, v] of entry.fields.entries()) {
    total += Buffer.byteLength(f, "utf8") + Buffer.byteLength(v, "utf8") + HASH_FIELD_OVERHEAD;
  }
  return total;
}
