import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { errWrongArgs } from "./command-utils.js";

// SCARD key
export function scard(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return errWrongArgs("scard");
  }

  try {
    const card = store.scard(args[0]);
    return encode.integer(card);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
