// Validation utilities and regex matchers extracted from core server logic.

import { INT64_MIN, INT64_MAX } from "./constants.js";

export const INTEGER_REGEX = /^-?\d+$/;
export const POSITIVE_INTEGER_REGEX = /^\d+$/;
export const CRLF_REGEX = /[\r\n]+/g;

export function isIntegerString(s: string): boolean {
  return INTEGER_REGEX.test(s);
}

export function isPositiveIntegerString(s: string): boolean {
  return POSITIVE_INTEGER_REGEX.test(s);
}

export function sanitizeCRLF(s: string): string {
  return s.replace(CRLF_REGEX, " ");
}

export function isWithinInt64(n: bigint): boolean {
  return n >= INT64_MIN && n <= INT64_MAX;
}
