import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// APPEND key value — appends to existing string (or creates it), returns new byte length
export function append(args: string[], store: Store): Buffer {
  if (args.length !== 2)
    return encode.error("ERR wrong number of arguments for 'append' command");
  const [key, value] = args;
  const newValue = (store.get(key) ?? "") + value;
  store.set(key, newValue, undefined, true);
  return encode.integer(Buffer.byteLength(newValue, "utf8"));
}
