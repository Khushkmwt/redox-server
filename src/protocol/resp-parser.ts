// Incremental RESP2 array parser.
//
// Feed raw TCP chunks into `feed()`. The parser accumulates bytes internally
// and emits complete parsed command arrays via the `onCommand` callback.
// A single chunk may contain 0, 1, or many complete commands. A command may
// arrive split across multiple chunks — the parser buffers until complete.
//
// Only the RESP2 array-of-bulk-strings format is supported (the format Redis
// clients use for commands). Inline commands are not supported.
//
// Parser states:
//   ARRAY_HEADER  — waiting for *<count>\r\n
//   BULK_HEADER   — waiting for $<len>\r\n
//   BULK_DATA     — reading exactly <len> bytes + \r\n
//
// On unrecoverable framing errors the parser calls `onError` and resets,
// allowing the connection to return a RESP2 error without crashing.

import {
  MAX_ARRAY_SIZE,
  MAX_BULK_BYTES,
  MAX_BUFFER_BYTES,
} from "../utils/constants.js";
import { isPositiveIntegerString } from "../utils/validators.js";

type State = "ARRAY_HEADER" | "BULK_HEADER" | "BULK_DATA";

export class RespParser {
  private buf: Buffer = Buffer.alloc(0);
  private state: State = "ARRAY_HEADER";
  private argsExpected = 0;
  private args: string[] = [];
  private bulkLen = 0; // expected byte length of current bulk string

  constructor(
    private readonly onCommand: (args: string[]) => void,
    private readonly onError: (msg: string) => void
  ) {}

  feed(chunk: Buffer): void {
    if (this.buf.length + chunk.length > MAX_BUFFER_BYTES) {
      this.error("ERR input buffer limit exceeded");
      return;
    }
    this.buf = Buffer.concat([this.buf, chunk]);
    this.process();
    if (this.buf.length === 0) {
      this.buf = Buffer.alloc(0);
    }
  }

  private process(): void {
    // Keep trying to make progress until we need more bytes.
    while (this.buf.length > 0) {
      const advanced = this.step();
      if (!advanced) break;
    }
  }

  /** Attempt one state-machine step. Returns true if progress was made. */
  private step(): boolean {
    switch (this.state) {
      case "ARRAY_HEADER":
        return this.readArrayHeader();
      case "BULK_HEADER":
        return this.readBulkHeader();
      case "BULK_DATA":
        return this.readBulkData();
    }
  }

  /**
   * Parse and validate a prefixed integer header line (e.g. `*<count>` or `$<len>`).
   * Returns parsed number, or null on error (after calling this.error()).
   */
  private parseHeaderCount(
    line: string,
    prefix: string,
    typeLabel: string,
    maxLimit: number
  ): number | null {
    if (!line.startsWith(prefix)) {
      this.error(`Expected ${typeLabel} (${prefix}), got: ${JSON.stringify(line)}`);
      return null;
    }

    const numStr = line.slice(1);
    const label = prefix === "*" ? "array count" : "bulk length";
    if (!isPositiveIntegerString(numStr)) {
      this.error(`Invalid ${label}: ${numStr}`);
      return null;
    }

    const num = parseInt(numStr, 10);
    if (isNaN(num) || num < 0) {
      this.error(`Invalid ${label}: ${numStr}`);
      return null;
    }

    if (num > maxLimit) {
      const unit = prefix === "$" ? ` bytes (max ${maxLimit})` : ` (max ${maxLimit})`;
      this.error(`${typeLabel === "bulk string" ? "Bulk string" : "Array"} too large: ${num}${unit}`);
      return null;
    }

    return num;
  }

  // --- State: ARRAY_HEADER ---
  // Expect:  *<n>\r\n
  private readArrayHeader(): boolean {
    const line = this.readLine();
    if (line === null) return false;

    const count = this.parseHeaderCount(line, "*", "array", MAX_ARRAY_SIZE);
    if (count === null) {
      return false; // Fatal framing error: abort further processing of this buffer
    }

    if (count === 0) {
      this.emit([]);
      return true;
    }

    this.argsExpected = count;
    this.args = [];
    this.state = "BULK_HEADER";
    return true;
  }

  // --- State: BULK_HEADER ---
  // Expect:  $<len>\r\n
  private readBulkHeader(): boolean {
    const line = this.readLine();
    if (line === null) return false;

    const len = this.parseHeaderCount(line, "$", "bulk string", MAX_BULK_BYTES);
    if (len === null) {
      return false; // Fatal framing error: abort further processing of this buffer
    }

    this.bulkLen = len;
    this.state = "BULK_DATA";
    return true;
  }

  // --- State: BULK_DATA ---
  // Expect:  <bulkLen bytes>\r\n
  private readBulkData(): boolean {
    const needed = this.bulkLen + 2; // data + CRLF
    if (this.buf.length < needed) return false; // wait for more bytes

    const data = this.buf.subarray(0, this.bulkLen);
    const crlf = this.buf.subarray(this.bulkLen, needed);

    if (crlf[0] !== 0x0d || crlf[1] !== 0x0a) {
      this.error(`Missing CRLF after bulk data`);
      return false;
    }

    this.args.push(data.toString("utf8"));
    this.buf = this.buf.subarray(needed);

    if (this.args.length === this.argsExpected) {
      this.emit(this.args);
    } else {
      this.state = "BULK_HEADER";
    }
    return true;
  }

  // --- Helpers ---

  /**
   * Try to read a CRLF-terminated line from the buffer.
   * Returns the line content (without CRLF) or null if not enough bytes yet.
   * Advances the buffer past the CRLF on success.
   */
  private readLine(): string | null {
    const idx = this.buf.indexOf("\r\n");
    if (idx === -1) return null;

    const line = this.buf.subarray(0, idx).toString("utf8");
    this.buf = this.buf.subarray(idx + 2);
    return line;
  }

  private emit(args: string[]): void {
    this.resetState();
    this.onCommand(args);
  }

  private error(msg: string): void {
    this.buf = Buffer.alloc(0); // clear remaining bytes so buffered commands do not execute
    this.resetState();
    this.onError(msg);
  }

  private resetState(): void {
    this.state = "ARRAY_HEADER";
    this.argsExpected = 0;
    this.args = [];
    this.bulkLen = 0;
  }
}
