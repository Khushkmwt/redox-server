import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isIntegerString } from "../utils/validators.js";
import { errWrongArgs, errNotInteger } from "./command-utils.js";

// LRANGE key start stop
export function lrange(args: string[], store: Store): Buffer {
  if (args.length !== 3) {
    return errWrongArgs("lrange");
  }

  const [key, startStr, stopStr] = args;

  if (!isIntegerString(startStr) || !isIntegerString(stopStr)) {
    return errNotInteger();
  }

  const start = parseInt(startStr, 10);
  const stop = parseInt(stopStr, 10);

  try {
    const items = store.lrange(key, start, stop);
    return encode.array(items.map((item) => encode.bulkString(item)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return encode.error(msg);
  }
}
