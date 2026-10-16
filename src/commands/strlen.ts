import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// STRLEN key — returns byte length of stored string, 0 if key missing
export function strlen(args: string[], store: Store): Buffer {
  if (args.length !== 1)
    return encode.error("ERR wrong number of arguments for 'strlen' command");
  const value = store.get(args[0]);
  if (value === undefined) return encode.integer(0);
  return encode.integer(Buffer.byteLength(value, "utf8"));
}
