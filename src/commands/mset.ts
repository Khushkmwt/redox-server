import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// MSET key1 value1 [key2 value2 ...] — sets given keys to their respective values
export function mset(args: string[], store: Store): Buffer {
  if (args.length === 0 || args.length % 2 !== 0) {
    return encode.error("ERR wrong number of arguments for 'mset' command");
  }

  for (let i = 0; i < args.length; i += 2) {
    store.set(args[i], args[i + 1]);
  }

  return encode.simpleString("OK");
}
