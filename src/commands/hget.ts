import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HGET key field
export function hget(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return encode.error("ERR wrong number of arguments for 'hget' command");
  }

  try {
    const val = store.hget(args[0], args[1]);
    if (val === undefined) {
      return encode.nullBulkString();
    }
    return encode.bulkString(val);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
