/**
 * Convert a Redis glob pattern (*, ?, [abc]) to a JavaScript RegExp.
 */
export function globToRegExp(pattern: string): RegExp {
  let regexStr = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      regexStr += ".*";
    } else if (c === "?") {
      regexStr += ".";
    } else if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close !== -1) {
        const inner = pattern.slice(i + 1, close);
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
