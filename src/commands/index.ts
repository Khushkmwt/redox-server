// Command dispatcher.
// Normalizes the command name, looks it up in the handler map,
// validates argument counts, and returns a RESP2-encoded response Buffer.
// All errors are returned as RESP2 error replies — nothing is thrown.

import { encode } from "../protocol/resp-encoder.js";
import type { Store } from "../storage/store.js";
import { ping } from "./ping.js";
import { set } from "./set.js";
import { get } from "./get.js";
import { del } from "./del.js";
import { exists } from "./exists.js";
import { type } from "./type.js";
import { echo } from "./echo.js";
import { dbsize } from "./dbsize.js";
import { flushall } from "./flushall.js";
import { append } from "./append.js";
import { strlen } from "./strlen.js";
import { incr } from "./incr.js";
import { incrby } from "./incrby.js";
import { decr } from "./decr.js";
import { decrby } from "./decrby.js";
import { mset } from "./mset.js";
import { mget } from "./mget.js";
import { keys } from "./keys.js";
import { command } from "./command.js";
import { info } from "./info.js";
import { hset } from "./hset.js";
import { hget } from "./hget.js";
import { hmget } from "./hmget.js";
import { hdel } from "./hdel.js";
import { hexists } from "./hexists.js";
import { hlen } from "./hlen.js";
import { hgetall } from "./hgetall.js";
import { hkeys } from "./hkeys.js";
import { hvals } from "./hvals.js";
import { expire } from "./expire.js";
import { pexpire } from "./pexpire.js";
import { ttl } from "./ttl.js";
import { pttl } from "./pttl.js";
import { persist } from "./persist.js";
import { save } from "./save.js";
import { lastsave } from "./lastsave.js";
import { lpush } from "./lpush.js";
import { rpush } from "./rpush.js";
import { lpop } from "./lpop.js";
import { rpop } from "./rpop.js";
import { lrange } from "./lrange.js";
import { llen } from "./llen.js";
import { sadd } from "./sadd.js";
import { srem } from "./srem.js";
import { smembers } from "./smembers.js";
import { sismember } from "./sismember.js";
import { scard } from "./scard.js";
import type { CommandHandler } from "../types/commands.js";

const handlers: Record<string, CommandHandler> = {
  PING: ping,
  SET: set,
  GET: get,
  DEL: del,
  EXISTS: exists,
  TYPE: type,
  ECHO: echo,
  DBSIZE: dbsize,
  FLUSHALL: flushall,
  APPEND: append,
  STRLEN: strlen,
  INCR: incr,
  INCRBY: incrby,
  DECR: decr,
  DECRBY: decrby,
  MSET: mset,
  MGET: mget,
  KEYS: keys,
  COMMAND: command,
  INFO: info,
  HSET: hset,
  HGET: hget,
  HMGET: hmget,
  HDEL: hdel,
  HEXISTS: hexists,
  HLEN: hlen,
  HGETALL: hgetall,
  HKEYS: hkeys,
  HVALS: hvals,
  EXPIRE: expire,
  PEXPIRE: pexpire,
  TTL: ttl,
  PTTL: pttl,
  PERSIST: persist,
  SAVE: save,
  LASTSAVE: lastsave,
  LPUSH: lpush,
  RPUSH: rpush,
  LPOP: lpop,
  RPOP: rpop,
  LRANGE: lrange,
  LLEN: llen,
  SADD: sadd,
  SREM: srem,
  SMEMBERS: smembers,
  SISMEMBER: sismember,
  SCARD: scard,
};

/**
 * Dispatch a parsed RESP2 command array to the appropriate handler.
 * @param args  Full argument list — args[0] is the command name.
 * @param store The shared key-value store.
 * @returns     A RESP2-encoded Buffer ready to write to the socket.
 */
export function dispatch(args: string[], store: Store): Buffer {
  if (args.length === 0) {
    return encode.error("ERR empty command");
  }

  store.totalCommands++;
  const name = args[0].toUpperCase();
  const handler = handlers[name];

  if (!handler) {
    return encode.error(
      `ERR unknown command '${args[0]}', with args beginning with: ${args.slice(1, 3).map((a) => `'${a}'`).join(", ")}`
    );
  }

  try {
    return handler(args.slice(1), store);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("WRONGTYPE") || msg.startsWith("OOM") || msg.startsWith("ERR")) {
      return encode.error(msg);
    }
    return encode.error(`ERR internal error: ${msg}`);
  }
}
