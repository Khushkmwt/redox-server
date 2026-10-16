import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// FLUSHALL — delete every key in the store
export function flushall(args: string[], store: Store): Buffer {
  if (args.length !== 0)
    return encode.error("ERR wrong number of arguments for 'flushall' command");
  store.flushAll();
  return encode.simpleString("OK");
}
