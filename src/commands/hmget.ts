import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// HMGET key field [field ...]
export function hmget(args: string[], store: Store): Buffer {
  if (args.length < 2) {
    return encode.error("ERR wrong number of arguments for 'hmget' command");
  }

  const key = args[0];
  const fields = args.slice(1);

  try {
    const values = store.hmget(key, fields);
    const items = values.map((v) =>
      v !== undefined ? encode.bulkString(v) : encode.nullBulkString()
    );
    return encode.array(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
