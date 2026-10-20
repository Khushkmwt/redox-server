import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HDEL key field [field ...]
export function hdel(args: string[], store: Store): Buffer {
  if (args.length < 2) {
    return encode.error("ERR wrong number of arguments for 'hdel' command");
  }

  const key = args[0];
  const fields = args.slice(1);

  try {
    const count = store.hdel(key, fields);
    return encode.integer(count);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
