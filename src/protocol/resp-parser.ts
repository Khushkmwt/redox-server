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

  // --- State: ARRAY_HEADER ---
  // Expect:  *<n>\r\n
  private readArrayHeader(): boolean {
    const line = this.readLine();
    if (line === null) return false;

    if (!line.startsWith("*")) {
      this.error(`Expected array (*), got: ${JSON.stringify(line)}`);
      return true; // consumed the bad line, keep going (after reset)
    }

    const countStr = line.slice(1);
    if (!isPositiveIntegerString(countStr)) {
      this.error(`Invalid array count: ${countStr}`);
      return true;
    }

    const count = parseInt(countStr, 10);
    if (isNaN(count) || count < 0) {
      this.error(`Invalid array count: ${countStr}`);
      return true;
    }
    if (count > MAX_ARRAY_SIZE) {
      this.error(`Array too large: ${count} (max ${MAX_ARRAY_SIZE})`);
      return true;
    }
    if (count === 0) {
      // Empty array — emit immediately.
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

    if (!line.startsWith("$")) {
      this.error(`Expected bulk string ($), got: ${JSON.stringify(line)}`);
      return true;
    }

    const lenStr = line.slice(1);
    if (!isPositiveIntegerString(lenStr)) {
      this.error(`Invalid bulk length: ${lenStr}`);
      return true;
    }

    const len = parseInt(lenStr, 10);
    if (isNaN(len) || len < 0) {
      this.error(`Invalid bulk length: ${lenStr}`);
      return true;
    }
    if (len > MAX_BULK_BYTES) {
      this.error(`Bulk string too large: ${len} bytes (max ${MAX_BULK_BYTES})`);
      return true;
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
      this.buf = this.buf.subarray(needed);
      return true;
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
