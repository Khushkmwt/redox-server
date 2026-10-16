import { describe, it, expect, vi } from "vitest";
import { RespParser } from "../../src/protocol/resp-parser.js";

function makeParser() {
  const commands: string[][] = [];
  const errors: string[] = [];
  const parser = new RespParser(
    (args) => commands.push(args),
    (msg) => errors.push(msg)
  );
  return { parser, commands, errors };
}

function encode(args: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const payload = Buffer.from(a, "utf8");
    parts.push(Buffer.from(`$${payload.byteLength}\r\n`));
    parts.push(payload);
    parts.push(Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

describe("resp-parser", () => {
  it("parses a single PING command", () => {
    const { parser, commands } = makeParser();
    parser.feed(encode(["PING"]));
    expect(commands).toEqual([["PING"]]);
  });

  it("parses SET with key and value", () => {
    const { parser, commands } = makeParser();
    parser.feed(encode(["SET", "name", "Alice"]));
    expect(commands).toEqual([["SET", "name", "Alice"]]);
  });

  it("parses two commands in one feed call (pipelining)", () => {
    const { parser, commands } = makeParser();
    const chunk = Buffer.concat([encode(["PING"]), encode(["GET", "x"])]);
    parser.feed(chunk);
    expect(commands).toEqual([["PING"], ["GET", "x"]]);
  });

  it("handles a command split across two feed calls (fragmentation)", () => {
    const { parser, commands } = makeParser();
    const full = encode(["SET", "k", "v"]);
    const half = Math.floor(full.length / 2);
    parser.feed(full.subarray(0, half));
    expect(commands).toHaveLength(0); // not yet complete
    parser.feed(full.subarray(half));
    expect(commands).toEqual([["SET", "k", "v"]]);
  });

  it("handles byte-accurate non-ASCII bulk strings", () => {
    const { parser, commands } = makeParser();
    // "Ø" is 2 bytes in UTF-8
    parser.feed(encode(["SET", "key", "Ø"]));
    expect(commands[0]).toEqual(["SET", "key", "Ø"]);
  });

  it("handles three commands across three byte-by-byte feeds", () => {
    const { parser, commands } = makeParser();
    const chunk = Buffer.concat([
      encode(["PING"]),
      encode(["SET", "a", "1"]),
      encode(["GET", "a"]),
    ]);
    for (const byte of chunk) {
      parser.feed(Buffer.from([byte]));
    }
    expect(commands).toEqual([["PING"], ["SET", "a", "1"], ["GET", "a"]]);
  });

  it("emits an error for unknown leading byte", () => {
    const { parser, errors } = makeParser();
    parser.feed(Buffer.from("+PING\r\n"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Expected array/);
  });

  it("recovers after a parse error and processes next valid command", () => {
    const { parser, commands, errors } = makeParser();
    parser.feed(Buffer.from("+bad\r\n"));
    parser.feed(encode(["PING"]));
    expect(errors).toHaveLength(1);
    expect(commands).toEqual([["PING"]]);
  });

  it("emits an error for invalid bulk length", () => {
    const { parser, errors } = makeParser();
    parser.feed(Buffer.from("*1\r\n$abc\r\n"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Invalid bulk length/);
  });
});
