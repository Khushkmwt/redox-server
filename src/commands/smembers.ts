import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { errWrongArgs } from "./command-utils.js";

// SMEMBERS key
export function smembers(args: string[], store: Store): Buffer {
  if (args.length !== 1) {
    return errWrongArgs("smembers");
  }

  try {
    const members = store.smembers(args[0]);
    return encode.array(members.map((m) => encode.bulkString(m)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
