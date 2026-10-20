import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isIntegerString } from "../utils/validators.js";

// RPOP key [count]
export function rpop(args: string[], store: Store): Buffer {
  if (args.length < 1 || args.length > 2) {
    return encode.error("ERR wrong number of arguments for 'rpop' command");
  }

  const key = args[0];

  if (args.length === 2) {
    if (!isIntegerString(args[1])) {
      return encode.error("ERR value is not an integer or out of range");
    }
    const count = parseInt(args[1], 10);
    if (count < 0) {
      return encode.error("ERR value is not an integer or out of range");
    }

    try {
      const res = store.rpop(key, count);
      if (res === null) return encode.nullBulkString();
      const list = res as string[];
      return encode.array(list.map((item) => encode.bulkString(item)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return encode.error(msg);
    }
  }

  try {
    const res = store.rpop(key);
    if (res === null) return encode.nullBulkString();
    return encode.bulkString(res as string);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
