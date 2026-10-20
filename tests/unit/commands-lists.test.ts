import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/storage/store.js";
import { dispatch } from "../../src/commands/index.js";

describe("List Commands Suite", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store();
  });

  describe("LPUSH and RPUSH", () => {
    it("pushes single and multiple elements", () => {
      // RPUSH queue a b c -> [a, b, c]
      let res = dispatch(["RPUSH", "queue", "a", "b", "c"], store);
      expect(res.toString()).toBe(":3\r\n");

      // LPUSH queue first -> [first, a, b, c]
      res = dispatch(["LPUSH", "queue", "first"], store);
      expect(res.toString()).toBe(":4\r\n");

      // LPUSH with multiple values prepends in sequence -> [x, y, first, a, b, c]
      res = dispatch(["LPUSH", "queue", "y", "x"], store);
      expect(res.toString()).toBe(":6\r\n");

      const items = dispatch(["LRANGE", "queue", "0", "-1"], store);
      expect(items.toString()).toBe(
        "*6\r\n$1\r\nx\r\n$1\r\ny\r\n$5\r\nfirst\r\n$1\r\na\r\n$1\r\nb\r\n$1\r\nc\r\n"
      );
    });

    it("returns error on wrong argument count", () => {
      const res = dispatch(["LPUSH", "k"], store);
      expect(res.toString()).toContain("-ERR wrong number of arguments");
    });

    it("returns WRONGTYPE error when operating on non-list key", () => {
      dispatch(["SET", "strkey", "hello"], store);
      const res = dispatch(["LPUSH", "strkey", "val"], store);
      expect(res.toString()).toBe(
        "-WRONGTYPE Operation against a key holding the wrong kind of value\r\n"
      );
    });
  });

  describe("LLEN", () => {
    it("returns 0 for non-existent key", () => {
      const res = dispatch(["LLEN", "nokey"], store);
      expect(res.toString()).toBe(":0\r\n");
    });

    it("returns list length", () => {
      dispatch(["RPUSH", "mylist", "1", "2", "3"], store);
      const res = dispatch(["LLEN", "mylist"], store);
      expect(res.toString()).toBe(":3\r\n");
    });

    it("returns WRONGTYPE error on non-list", () => {
      dispatch(["HSET", "myhash", "f", "v"], store);
      const res = dispatch(["LLEN", "myhash"], store);
      expect(res.toString()).toBe(
        "-WRONGTYPE Operation against a key holding the wrong kind of value\r\n"
      );
    });
  });

  describe("LPOP and RPOP", () => {
    beforeEach(() => {
      dispatch(["RPUSH", "letters", "a", "b", "c", "d"], store);
    });

    it("pops single element from left and right", () => {
      let res = dispatch(["LPOP", "letters"], store);
      expect(res.toString()).toBe("$1\r\na\r\n");

      res = dispatch(["RPOP", "letters"], store);
      expect(res.toString()).toBe("$1\r\nd\r\n");

      const remaining = dispatch(["LRANGE", "letters", "0", "-1"], store);
      expect(remaining.toString()).toBe("*2\r\n$1\r\nb\r\n$1\r\nc\r\n");
    });

    it("pops with count argument", () => {
      const res = dispatch(["LPOP", "letters", "2"], store);
      expect(res.toString()).toBe("*2\r\n$1\r\na\r\n$1\r\nb\r\n");

      const remaining = dispatch(["LRANGE", "letters", "0", "-1"], store);
      expect(remaining.toString()).toBe("*2\r\n$1\r\nc\r\n$1\r\nd\r\n");
    });

    it("returns null bulk string when popping from non-existent key", () => {
      const res1 = dispatch(["LPOP", "nokey"], store);
      expect(res1.toString()).toBe("$-1\r\n");

      const res2 = dispatch(["RPOP", "nokey", "2"], store);
      expect(res2.toString()).toBe("$-1\r\n");
    });

    it("automatically deletes key when list becomes empty", () => {
      dispatch(["LPOP", "letters", "4"], store);
      expect(store.exists("letters")).toBe(0);
      expect(store.type("letters")).toBe("none");
    });

    it("validates count argument", () => {
      const res = dispatch(["LPOP", "letters", "invalid"], store);
      expect(res.toString()).toContain("-ERR value is not an integer");
    });
  });

  describe("LRANGE", () => {
    beforeEach(() => {
      dispatch(["RPUSH", "nums", "one", "two", "three", "four", "five"], store);
    });

    it("handles zero-based positive slices", () => {
      const res = dispatch(["LRANGE", "nums", "0", "2"], store);
      expect(res.toString()).toBe("*3\r\n$3\r\none\r\n$3\r\ntwo\r\n$5\r\nthree\r\n");
    });

    it("handles negative indexes", () => {
      // 0 -1 returns all elements
      let res = dispatch(["LRANGE", "nums", "0", "-1"], store);
      expect(res.toString()).toContain("five");

      // -3 -1 returns last 3 elements
      res = dispatch(["LRANGE", "nums", "-3", "-1"], store);
      expect(res.toString()).toBe("*3\r\n$5\r\nthree\r\n$4\r\nfour\r\n$4\r\nfive\r\n");
    });

    it("clamps out-of-bounds ranges gracefully", () => {
      const res = dispatch(["LRANGE", "nums", "0", "100"], store);
      expect(res.toString()).toBe(
        "*5\r\n$3\r\none\r\n$3\r\ntwo\r\n$5\r\nthree\r\n$4\r\nfour\r\n$4\r\nfive\r\n"
      );
    });

    it("returns empty array when start > stop", () => {
      const res = dispatch(["LRANGE", "nums", "3", "1"], store);
      expect(res.toString()).toBe("*0\r\n");
    });

    it("returns empty array for non-existent key", () => {
      const res = dispatch(["LRANGE", "nokey", "0", "-1"], store);
      expect(res.toString()).toBe("*0\r\n");
    });
  });
});
