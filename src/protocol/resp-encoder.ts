// RESP2 response encoder.
// All lengths are byte-lengths (Buffer.byteLength), never JS character counts.
// Every response is terminated with CRLF as required by the RESP2 spec.

const CRLF = "\r\n";

function crlf(s: string): Buffer {
  return Buffer.from(s + CRLF, "utf8");
}

/** +OK\r\n  (or any simple string) */
function simpleString(s: string): Buffer {
  return crlf(`+${s}`);
}

/** -ERR message\r\n */
function error(msg: string): Buffer {
  return crlf(`-${msg}`);
}

/** :42\r\n */
function integer(n: number | bigint): Buffer {
  return crlf(`:${n.toString()}`);
}

/** $5\r\nAlice\r\n  — byte-length prefixed bulk string */
function bulkString(s: string): Buffer {
  const payload = Buffer.from(s, "utf8");
  const header = Buffer.from(`$${payload.byteLength}${CRLF}`, "utf8");
  const tail = Buffer.from(CRLF, "utf8");
  return Buffer.concat([header, payload, tail]);
}

/** $-1\r\n  — null bulk string (missing key) */
function nullBulkString(): Buffer {
  return Buffer.from(`$-1${CRLF}`, "utf8");
}

/** *3\r\n...  — array of pre-encoded RESP2 buffers */
function array(items: Buffer[]): Buffer {
  const header = Buffer.from(`*${items.length}${CRLF}`, "utf8");
  return Buffer.concat([header, ...items]);
}

export const encode = {
  simpleString,
  error,
  integer,
  bulkString,
  nullBulkString,
  array,
};
