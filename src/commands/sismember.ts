import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { errWrongArgs } from "./command-utils.js";

// SISMEMBER key member
export function sismember(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return errWrongArgs("sismember");
  }

  const [key, member] = args;
  try {
    const isMember = store.sismember(key, member);
    return encode.integer(isMember ? 1 : 0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
