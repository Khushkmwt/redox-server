import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// MGET key [key ...] — returns values of all specified keys as an array
export function mget(args: string[], store: Store): Buffer {
  if (args.length === 0) {
    return encode.error("ERR wrong number of arguments for 'mget' command");
  }

  const items: Buffer[] = [];
  for (const key of args) {
    const val = store.get(key);
    if (val === undefined) {
      items.push(encode.nullBulkString());
    } else {
      items.push(encode.bulkString(val));
    }
  }

  return encode.array(items);
}
