import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { errWrongArgs } from "./command-utils.js";

// SADD key member [member ...]
export function sadd(args: string[], store: Store): Buffer {
  if (args.length < 2) {
    return errWrongArgs("sadd");
  }

  const [key, ...members] = args;
  try {
    const added = store.sadd(key, members);
    return encode.integer(added);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
