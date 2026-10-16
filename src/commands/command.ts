import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";

export const SUPPORTED_COMMANDS = [
  "PING",
  "SET",
  "GET",
  "DEL",
  "EXISTS",
  "TYPE",
  "ECHO",
  "DBSIZE",
  "FLUSHALL",
  "APPEND",
  "STRLEN",
  "INCR",
  "INCRBY",
  "DECR",
  "DECRBY",
  "MSET",
  "MGET",
  "KEYS",
  "COMMAND",
  "INFO",
  "HSET",
  "HGET",
  "HMGET",
  "HDEL",
  "HEXISTS",
  "HLEN",
  "HGETALL",
  "HKEYS",
  "HVALS",
  "EXPIRE",
  "PEXPIRE",
  "TTL",
  "PTTL",
  "PERSIST",
  "SAVE",
  "LASTSAVE",
];

// COMMAND [DOCS | COUNT | LIST]
export function command(args: string[], _store: Store): Buffer {
  const sub = args[0]?.toUpperCase();

  if (sub === "COUNT") {
    return encode.integer(SUPPORTED_COMMANDS.length);
  }

  if (sub === "DOCS") {
    return encode.array([]);
  }

  // COMMAND or COMMAND LIST returns array of command names as bulk strings
  const items = SUPPORTED_COMMANDS.map((name) => encode.bulkString(name));
  return encode.array(items);
}
