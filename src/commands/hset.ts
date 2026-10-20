import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HSET key field value [field value ...]
export function hset(args: string[], store: Store): Buffer {
  if (args.length < 3 || (args.length - 1) % 2 !== 0) {
    return encode.error("ERR wrong number of arguments for 'hset' command");
  }

  const key = args[0];
  const fieldPairs: [string, string][] = [];

  for (let i = 1; i < args.length; i += 2) {
    fieldPairs.push([args[i], args[i + 1]]);
  }

  try {
    const createdCount = store.hset(key, fieldPairs);
    return encode.integer(createdCount);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
