import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HVALS key
export function hvals(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'hvals' command");
  }

  try {
    const vals = store.hvals(args[0]);
    const items = vals.map((v) => encode.bulkString(v));
    return encode.array(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
