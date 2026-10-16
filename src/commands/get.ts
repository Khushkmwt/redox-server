import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// GET key
export function get(args: string[], store: Store): Buffer {
  if (args.length !== 1)
    return encode.error("ERR wrong number of arguments for 'get' command");
  const value = store.get(args[0]);
  return value === undefined ? encode.nullBulkString() : encode.bulkString(value);
}
