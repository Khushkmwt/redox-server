import { encode } from "../protocol/resp-encoder.js";
import { ERR_NOT_INTEGER, ERR_SYNTAX } from "../utils/constants.js";

/**
 * Standard Redis wrong number of arguments error response.
 */
export function errWrongArgs(cmd: string): Buffer {
  return encode.error(`ERR wrong number of arguments for '${cmd}' command`);
}

/**
 * Standard Redis non-integer or out of range error response.
 */
export function errNotInteger(): Buffer {
  return encode.error(ERR_NOT_INTEGER);
}

/**
 * Standard Redis syntax error response.
 */
export function errSyntax(): Buffer {
  return encode.error(ERR_SYNTAX);
}
