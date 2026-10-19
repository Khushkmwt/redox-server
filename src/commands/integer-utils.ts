import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { isIntegerString, isWithinInt64 } from "../utils/validators.js";

/**
 * Apply an integer delta (positive or negative) to the number stored at key.
 * If the key does not exist, it is initialized to 0.
 * Returns RESP2 integer response or RESP2 error response.
 */
export function applyIntegerDelta(
  key: string,
  delta: bigint,
  store: Store
): Buffer {
  const current = store.get(key);

  let val: bigint;
  if (current === undefined) {
    val = 0n;
  } else {
    if (!isIntegerString(current)) {
      return encode.error("ERR value is not an integer or out of range");
    }
    try {
      val = BigInt(current);
    } catch {
      return encode.error("ERR value is not an integer or out of range");
    }
  }

  const result = val + delta;
  if (!isWithinInt64(result)) {
    return encode.error("ERR increment or decrement would overflow");
  }
  store.set(key, result.toString(), undefined, true);
  return encode.integer(result);
}

export function parseIntegerArg(arg: string): bigint | null {
  if (!isIntegerString(arg)) {
    return null;
  }
  try {
    return BigInt(arg);
  } catch {
    return null;
  }
}
