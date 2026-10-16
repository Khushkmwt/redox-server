import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// DBSIZE — returns the number of keys in the store
export function dbsize(args: string[], store: Store): Buffer {
  if (args.length !== 0)
    return encode.error("ERR wrong number of arguments for 'dbsize' command");
  return encode.integer(store.size());
}
