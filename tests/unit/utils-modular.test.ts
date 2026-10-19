import { describe, it, expect } from "vitest";
import {
  isIntegerString,
  isPositiveIntegerString,
  sanitizeCRLF,
  isWithinInt64,
} from "../../src/utils/validators.js";
import {
  INT64_MAX,
  INT64_MIN,
  MAX_ARRAY_SIZE,
  MAX_BULK_BYTES,
  MAX_BUFFER_BYTES,
  MAX_PATTERN_LENGTH,
} from "../../src/utils/constants.js";

describe("redox-server modular utils and validators", () => {
  it("validates integer strings correctly", () => {
    expect(isIntegerString("123")).toBe(true);
    expect(isIntegerString("-456")).toBe(true);
    expect(isIntegerString("0")).toBe(true);
    expect(isIntegerString("12.34")).toBe(false);
    expect(isIntegerString("abc")).toBe(false);
    expect(isIntegerString("")).toBe(false);
  });

  it("validates positive integer strings correctly", () => {
    expect(isPositiveIntegerString("123")).toBe(true);
    expect(isPositiveIntegerString("0")).toBe(true);
    expect(isPositiveIntegerString("-123")).toBe(false);
    expect(isPositiveIntegerString("foo")).toBe(false);
  });

  it("sanitizes CRLF sequences in strings", () => {
    expect(sanitizeCRLF("hello\r\nworld")).toBe("hello world");
    expect(sanitizeCRLF("line1\nline2\rline3")).toBe("line1 line2 line3");
  });

  it("validates 64-bit integer range boundary", () => {
    expect(isWithinInt64(INT64_MAX)).toBe(true);
    expect(isWithinInt64(INT64_MIN)).toBe(true);
    expect(isWithinInt64(INT64_MAX + 1n)).toBe(false);
    expect(isWithinInt64(INT64_MIN - 1n)).toBe(false);
  });

  it("exposes expected sizing constants", () => {
    expect(MAX_ARRAY_SIZE).toBe(1024);
    expect(MAX_BULK_BYTES).toBe(512 * 1024 * 1024);
    expect(MAX_BUFFER_BYTES).toBe(64 * 1024 * 1024);
    expect(MAX_PATTERN_LENGTH).toBe(1024);
  });
});
