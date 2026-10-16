import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

// PING [message]
// No message → +PONG\r\n
// With message → bulk string echo
export function ping(args: string[], _store: Store): Buffer {
  if (args.length === 0) return encode.simpleString("PONG");
  if (args.length === 1) return encode.bulkString(args[0]);
  return encode.error("ERR wrong number of arguments for 'ping' command");
}
