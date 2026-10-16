import { describe, it, expect } from "vitest";
import { encode } from "../../src/protocol/resp-encoder.js";

describe("resp-encoder", () => {
  it("encodes a simple string", () => {
    expect(encode.simpleString("OK").toString()).toBe("+OK\r\n");
  });

  it("encodes PONG", () => {
    expect(encode.simpleString("PONG").toString()).toBe("+PONG\r\n");
  });

  it("encodes an error", () => {
    expect(encode.error("ERR unknown command").toString()).toBe(
      "-ERR unknown command\r\n"
    );
  });

  it("encodes an integer", () => {
    expect(encode.integer(42).toString()).toBe(":42\r\n");
    expect(encode.integer(0).toString()).toBe(":0\r\n");
  });

  it("encodes a bulk string", () => {
    expect(encode.bulkString("Alice").toString()).toBe("$5\r\nAlice\r\n");
  });

  it("encodes a bulk string using byte length (non-ASCII)", () => {
    // "é" is 2 bytes in UTF-8 → header should be "$2\r\n" (4 bytes)
    const buf = encode.bulkString("é");
    expect(buf.subarray(0, 4).toString()).toBe("$2\r\n");
    // total = 4 (header) + 2 (é) + 2 (CRLF) = 8 bytes
    expect(buf.byteLength).toBe(8);
  });

  it("encodes an empty bulk string", () => {
    expect(encode.bulkString("").toString()).toBe("$0\r\n\r\n");
  });

  it("encodes a null bulk string", () => {
    expect(encode.nullBulkString().toString()).toBe("$-1\r\n");
  });
});
