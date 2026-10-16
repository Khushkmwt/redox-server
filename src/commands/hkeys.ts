import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HKEYS key
export function hkeys(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'hkeys' command");
  }

  try {
    const keys = store.hkeys(args[0]);
    const items = keys.map((k) => encode.bulkString(k));
    return encode.array(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
