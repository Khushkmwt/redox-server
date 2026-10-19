import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// MSET key1 value1 [key2 value2 ...] — sets given keys to their respective values
export function mset(args: string[], store: Store): Buffer {
  if (args.length === 0 || args.length % 2 !== 0) {
    return encode.error("ERR wrong number of arguments for 'mset' command");
  }

  const pairs: [string, string][] = [];
  for (let i = 0; i < args.length; i += 2) {
    pairs.push([args[i], args[i + 1]]);
  }

  try {
    store.mset(pairs);
    return encode.simpleString("OK");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
