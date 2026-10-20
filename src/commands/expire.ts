import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isIntegerString } from "../utils/validators.js";
import { errWrongArgs, errNotInteger } from "./command-utils.js";

// EXPIRE key seconds
export function expire(args: string[], store: Store): Buffer {
  if (args.length !== 2) {
    return errWrongArgs("expire");
  }

  if (!isIntegerString(args[1])) {
    return errNotInteger();
  }

  const seconds = parseInt(args[1], 10);
  if (isNaN(seconds)) {
    return errNotInteger();
  }

  const ok = store.expire(args[0], seconds);
  return encode.integer(ok ? 1 : 0);
}
