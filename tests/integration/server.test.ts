// Integration tests — spin up a real TCP server, send raw RESP2, verify responses.
// Uses the actual server module so every layer is exercised end-to-end.

import net from "node:net";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { store } from "../../src/storage/store.js";

const TEST_PORT = 16379;
const TEST_HOST = "127.0.0.1";

// ---- RESP2 helpers --------------------------------------------------------

function encodeCommand(...args: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const payload = Buffer.from(a, "utf8");
    parts.push(Buffer.from(`$${payload.byteLength}\r\n`));
    parts.push(payload);
    parts.push(Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

/** Send a command and collect the complete response (waits for first data event). */
function sendCommand(
  socket: net.Socket,
  ...args: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
    socket.once("error", reject);
    socket.write(encodeCommand(...args));
  });
}

/** Open a TCP connection to the test server. */
function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(TEST_PORT, TEST_HOST, () =>
      resolve(socket)
    );
    socket.once("error", reject);
  });
}

// ---- Server lifecycle -----------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serverProcess: any;

beforeAll(async () => {
  // Dynamically import server to start it in-process on our test port.
  // We override PORT before importing so the server binds to TEST_PORT.
  process.env.PORT = String(TEST_PORT);

  // Import server module — it starts listening as a side-effect.
  await import("../../src/server.js");

  // Give the server a moment to bind.
  await new Promise((r) => setTimeout(r, 100));
});

afterAll(() => {
  // Server shuts down with the process; nothing extra needed in-process tests.
  delete process.env.PORT;
});

beforeEach(() => {
  store.flushAll();
});

// ---- Tests ----------------------------------------------------------------

describe("integration: core commands", () => {
  it("PING returns +PONG", async () => {
    const s = await connect();
    const res = await sendCommand(s, "PING");
    expect(res).toBe("+PONG\r\n");
    s.destroy();
  });

  it("PING with message returns bulk string", async () => {
    const s = await connect();
    const res = await sendCommand(s, "PING", "hello");
    expect(res).toBe("$5\r\nhello\r\n");
    s.destroy();
  });

  it("SET then GET returns value", async () => {
    const s = await connect();
    await sendCommand(s, "SET", "name", "Alice");
    const res = await sendCommand(s, "GET", "name");
    expect(res).toBe("$5\r\nAlice\r\n");
    s.destroy();
  });

  it("GET missing key returns null bulk string", async () => {
    const s = await connect();
    const res = await sendCommand(s, "GET", "missing");
    expect(res).toBe("$-1\r\n");
    s.destroy();
  });

  it("SET overwrites existing key", async () => {
    const s = await connect();
    await sendCommand(s, "SET", "name", "Alice");
    await sendCommand(s, "SET", "name", "Bob");
    const res = await sendCommand(s, "GET", "name");
    expect(res).toBe("$3\r\nBob\r\n");
    s.destroy();
  });

  it("DEL existing key returns :1", async () => {
    const s = await connect();
    await sendCommand(s, "SET", "a", "v");
    const res = await sendCommand(s, "DEL", "a");
    expect(res).toBe(":1\r\n");
    s.destroy();
  });

  it("DEL missing key returns :0", async () => {
    const s = await connect();
    const res = await sendCommand(s, "DEL", "missing");
    expect(res).toBe(":0\r\n");
    s.destroy();
  });

  it("EXISTS and TYPE", async () => {
    const s = await connect();
    await sendCommand(s, "SET", "a", "1");
    expect(await sendCommand(s, "EXISTS", "a", "b")).toBe(":1\r\n");
    expect(await sendCommand(s, "TYPE", "a")).toBe("+string\r\n");
    expect(await sendCommand(s, "TYPE", "missing")).toBe("+none\r\n");
    s.destroy();
  });
});

describe("integration: pipelining", () => {
  it("sends 3 commands in one write, reads 3 responses", async () => {
    const s = await connect();

    const pipeline = Buffer.concat([
      encodeCommand("SET", "x", "42"),
      encodeCommand("GET", "x"),
      encodeCommand("DEL", "x"),
    ]);

    const result = await new Promise<string>((resolve, reject) => {
      let acc = "";
      const onData = (chunk: Buffer) => {
        acc += chunk.toString("utf8");
        // Expect three responses
        if (acc.split("\r\n").filter(Boolean).length >= 3) {
          s.removeListener("data", onData);
          resolve(acc);
        }
      };
      s.on("data", onData);
      s.once("error", reject);
      s.write(pipeline);
    });

    expect(result).toContain("+OK\r\n");
    expect(result).toContain("$2\r\n42\r\n");
    expect(result).toContain(":1\r\n");
    s.destroy();
  });
});

describe("integration: shared state", () => {
  it("client A writes, client B reads", async () => {
    const a = await connect();
    const b = await connect();

    await sendCommand(a, "SET", "name", "SharedValue");
    const res = await sendCommand(b, "GET", "name");
    expect(res).toBe("$11\r\nSharedValue\r\n");

    a.destroy();
    b.destroy();
  });
});

describe("integration: error handling", () => {
  it("unknown command returns RESP2 error", async () => {
    const s = await connect();
    const res = await sendCommand(s, "NONEXISTENT_CMD");
    expect(res).toMatch(/^-ERR/);
    s.destroy();
  });

  it("server survives malformed input", async () => {
    const s = await connect();
    s.write(Buffer.from("garbage\r\n"));
    // Give server time to process
    await new Promise((r) => setTimeout(r, 50));

    // Connect a fresh client — server should still be alive
    const s2 = await connect();
    const res = await sendCommand(s2, "PING");
    expect(res).toBe("+PONG\r\n");
    s2.destroy();
  });
});

describe("integration: multi-key and numeric commands", () => {
  it("MSET and MGET over TCP", async () => {
    const s = await connect();
    const setRes = await sendCommand(s, "MSET", "k1", "v1", "k2", "v2");
    expect(setRes).toBe("+OK\r\n");

    const getRes = await sendCommand(s, "MGET", "k1", "nonexistent", "k2");
    expect(getRes).toBe("*3\r\n$2\r\nv1\r\n$-1\r\n$2\r\nv2\r\n");
    s.destroy();
  });

  it("INCR and DECR over TCP", async () => {
    const s = await connect();
    const incr1 = await sendCommand(s, "INCR", "counter");
    expect(incr1).toBe(":1\r\n");

    const incr2 = await sendCommand(s, "INCRBY", "counter", "10");
    expect(incr2).toBe(":11\r\n");

    const decr1 = await sendCommand(s, "DECR", "counter");
    expect(decr1).toBe(":10\r\n");
    s.destroy();
  });

  it("KEYS and COMMAND over TCP", async () => {
    const s = await connect();
    await sendCommand(s, "SET", "user:1", "val");
    await sendCommand(s, "SET", "user:2", "val");

    const keysRes = await sendCommand(s, "KEYS", "user:*");
    expect(keysRes).toContain("user:1");
    expect(keysRes).toContain("user:2");

    const cmdRes = await sendCommand(s, "COMMAND", "COUNT");
    expect(cmdRes).toMatch(/^:\d+\r\n$/);
    s.destroy();
  });
});

describe("integration: hashes and info", () => {
  it("HSET, HGET, and HGETALL over TCP", async () => {
    const s = await connect();
    const setRes = await sendCommand(s, "HSET", "user:100", "name", "Alice", "role", "Dev");
    expect(setRes).toBe(":2\r\n");

    const getRes = await sendCommand(s, "HGET", "user:100", "name");
    expect(getRes).toBe("$5\r\nAlice\r\n");

    const allRes = await sendCommand(s, "HGETALL", "user:100");
    expect(allRes).toContain("name");
    expect(allRes).toContain("Alice");
    expect(allRes).toContain("role");
    expect(allRes).toContain("Dev");

    const typeRes = await sendCommand(s, "TYPE", "user:100");
    expect(typeRes).toBe("+hash\r\n");
    s.destroy();
  });

  it("INFO memory returns server diagnostics over TCP", async () => {
    const s = await connect();
    const infoRes = await sendCommand(s, "INFO", "memory");
    expect(infoRes).toContain("# Memory");
    expect(infoRes).toContain("used_memory:");
    s.destroy();
  });

  it("EXPIRE and TTL over TCP", async () => {
    const s = await connect();
    await sendCommand(s, "SET", "mykey", "val");
    const expRes = await sendCommand(s, "EXPIRE", "mykey", "60");
    expect(expRes).toBe(":1\r\n");

    const ttlRes = await sendCommand(s, "TTL", "mykey");
    const ttlVal = parseInt(ttlRes.slice(1, -2), 10);
    expect(ttlVal).toBeGreaterThan(0);
    expect(ttlVal).toBeLessThanOrEqual(60);

    const persistRes = await sendCommand(s, "PERSIST", "mykey");
    expect(persistRes).toBe(":1\r\n");

    const ttlAfter = await sendCommand(s, "TTL", "mykey");
    expect(ttlAfter).toBe(":-1\r\n");
    s.destroy();
  });
});


