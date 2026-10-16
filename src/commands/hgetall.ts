import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HGETALL key
export function hgetall(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'hgetall' command");
  }

  try {
    const pairs = store.hgetall(args[0]);
    const items: Buffer[] = [];
    for (const [field, val] of pairs) {
      items.push(encode.bulkString(field));
      items.push(encode.bulkString(val));
    }
    return encode.array(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
