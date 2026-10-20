import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { errWrongArgs } from "./command-utils.js";

// LLEN key
export function llen(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return errWrongArgs("llen");
  }

  try {
    const len = store.llen(args[0]);
    return encode.integer(len);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
