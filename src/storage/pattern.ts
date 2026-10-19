import { MAX_PATTERN_LENGTH } from "../utils/constants.js";

/**
 * Convert a Redis glob pattern (*, ?, [abc]) to a JavaScript RegExp.
 */
export function globToRegExp(pattern: string): RegExp {
  // Cap excessively long patterns
  const safePattern =
    pattern.length > MAX_PATTERN_LENGTH
      ? pattern.slice(0, MAX_PATTERN_LENGTH)
      : pattern;
  let regexStr = "^";
  for (let i = 0; i < safePattern.length; i++) {
    const c = safePattern[i];
    if (c === "*") {
      // Collapse consecutive wildcards like *** into a single .*
      while (i + 1 < safePattern.length && safePattern[i + 1] === "*") {
        i++;
      }
      regexStr += ".*";
    } else if (c === "?") {
      regexStr += ".";
    } else if (c === "[") {
      const close = safePattern.indexOf("]", i + 1);
      if (close !== -1) {
        const inner = safePattern.slice(i + 1, close);
        regexStr += `[${inner.replace(/\\/g, "\\\\")}]`;
        i = close;
      } else {
        regexStr += "\\[";
      }
    } else if ("\\.+*?^$()[]{}|".includes(c)) {
      regexStr += `\\${c}`;
    } else {
      regexStr += c;
    }
  }
  regexStr += "$";
  return new RegExp(regexStr);
}
