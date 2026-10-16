import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { applyIntegerDelta } from "./integer-utils.js";

// INCR key — increment number stored at key by 1
export function incr(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return encode.error("ERR wrong number of arguments for 'incr' command");
  }
  return applyIntegerDelta(args[0], 1n, store);
}
