import net from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRedoxServer } from "../../src/server.js";
import { Store } from "../../src/storage/store.js";

const STRESS_PORT = 17379;
const STRESS_HOST = "127.0.0.1";

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

function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(STRESS_PORT, STRESS_HOST, () =>
      resolve(socket)
    );
    socket.once("error", reject);
  });
}

describe("concurrency and stress test suite", () => {
  let stressStore: Store;
  let stressServer: net.Server;

  beforeAll(async () => {
    stressStore = new Store({ maxMemoryBytes: 500 * 1024, evictionPolicy: "allkeys-lru" });
    stressServer = createRedoxServer({
      store: stressStore,
      maxConnections: 250,
    });

    await new Promise<void>((resolve) => {
      stressServer.listen(STRESS_PORT, STRESS_HOST, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      stressServer.close(() => resolve());
    });
  });

  it("handles 50 simultaneous connections executing 10,000+ mixed operations without error", async () => {
    const NUM_CLIENTS = 50;
    const OPS_PER_CLIENT = 200; // 50 * 200 = 10,000 operations total

    const sockets: net.Socket[] = [];

    // Connect all 50 sockets simultaneously
    for (let i = 0; i < NUM_CLIENTS; i++) {
      sockets.push(await connect());
    }

    const clientPromises = sockets.map(async (socket, clientIndex) => {
      let buffer = "";
      const pendingResolvers: ((res: string) => void)[] = [];

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");

        // Parse individual RESP2 messages in stream
        while (buffer.length > 0) {
          const type = buffer[0];
          if (type === "+" || type === "-" || type === ":") {
            const idx = buffer.indexOf("\r\n");
            if (idx === -1) break;
            const msg = buffer.slice(0, idx + 2);
            buffer = buffer.slice(idx + 2);
            const resolve = pendingResolvers.shift();
            if (resolve) resolve(msg);
          } else if (type === "$") {
            const idx = buffer.indexOf("\r\n");
            if (idx === -1) break;
            const len = parseInt(buffer.slice(1, idx), 10);
            if (len === -1) {
              const msg = buffer.slice(0, idx + 2);
              buffer = buffer.slice(idx + 2);
              const resolve = pendingResolvers.shift();
              if (resolve) resolve(msg);
            } else {
              const fullLen = idx + 2 + len + 2;
              if (buffer.length < fullLen) break;
              const msg = buffer.slice(0, fullLen);
              buffer = buffer.slice(fullLen);
              const resolve = pendingResolvers.shift();
              if (resolve) resolve(msg);
            }
          } else if (type === "*") {
            // For array responses (e.g. MGET, HGETALL, KEYS)
            const idx = buffer.indexOf("\r\n");
            if (idx === -1) break;
            const count = parseInt(buffer.slice(1, idx), 10);
            if (count === -1 || count === 0) {
              const msg = buffer.slice(0, idx + 2);
              buffer = buffer.slice(idx + 2);
              const resolve = pendingResolvers.shift();
              if (resolve) resolve(msg);
            } else {
              // Parse through count elements
              let curr = idx + 2;
              let complete = true;
              for (let elem = 0; elem < count; elem++) {
                if (curr >= buffer.length) {
                  complete = false;
                  break;
                }
                const elemType = buffer[curr];
                const crlf = buffer.indexOf("\r\n", curr);
                if (crlf === -1) {
                  complete = false;
                  break;
                }
                if (elemType === "$") {
                  const elemLen = parseInt(buffer.slice(curr + 1, crlf), 10);
                  if (elemLen === -1) {
                    curr = crlf + 2;
                  } else {
                    const nextPos = crlf + 2 + elemLen + 2;
                    if (buffer.length < nextPos) {
                      complete = false;
                      break;
                    }
                    curr = nextPos;
                  }
                } else {
                  curr = crlf + 2;
                }
              }
              if (!complete) break;
              const msg = buffer.slice(0, curr);
              buffer = buffer.slice(curr);
              const resolve = pendingResolvers.shift();
              if (resolve) resolve(msg);
            }
          } else {
            // Unknown frame
            break;
          }
        }
      });

      function execute(...args: string[]): Promise<string> {
        return new Promise((resolve) => {
          pendingResolvers.push(resolve);
          socket.write(encodeCommand(...args));
        });
      }

      // Execute mixed burst
      for (let op = 0; op < OPS_PER_CLIENT; op++) {
        const key = `key:${clientIndex}:${op % 20}`;
        const hashKey = `hash:${clientIndex}:${op % 10}`;
        const listKey = `list:${clientIndex}:${op % 10}`;
        const setKey = `set:${clientIndex}:${op % 10}`;
        const opType = op % 10;

        let res: string;
        switch (opType) {
          case 0: // SET
            res = await execute("SET", key, `val-${op}`);
            expect(res).toBe("+OK\r\n");
            break;
          case 1: // GET
            res = await execute("GET", key);
            expect(res.startsWith("$")).toBe(true);
            break;
          case 2: // HSET
            res = await execute("HSET", hashKey, "fieldA", `data-${op}`, "fieldB", `${op}`);
            expect(res.startsWith(":")).toBe(true);
            break;
          case 3: // HGET
            res = await execute("HGET", hashKey, "fieldA");
            expect(res.startsWith("$")).toBe(true);
            break;
          case 4: // INCR / DECR
            res = await execute("INCR", `counter:${clientIndex}`);
            expect(res.startsWith(":")).toBe(true);
            break;
          case 5: // EXPIRE & TTL
            await execute("EXPIRE", key, "100");
            res = await execute("TTL", key);
            expect(res.startsWith(":")).toBe(true);
            break;
          case 6: // MSET & MGET
            await execute("MSET", `${key}:m1`, "v1", `${key}:m2`, "v2");
            res = await execute("MGET", `${key}:m1`, `${key}:m2`);
            expect(res.startsWith("*2\r\n")).toBe(true);
            break;
          case 7: // DEL
            res = await execute("DEL", key);
            expect(res.startsWith(":")).toBe(true);
            break;
          case 8: // LPUSH & LPOP
            await execute("RPUSH", listKey, `item-${op}`);
            res = await execute("LPOP", listKey);
            expect(res.startsWith("$")).toBe(true);
            break;
          case 9: // SADD & SISMEMBER
            await execute("SADD", setKey, `tag-${op}`);
            res = await execute("SISMEMBER", setKey, `tag-${op}`);
            expect(res).toBe(":1\r\n");
            break;
        }
      }
    });

    await Promise.all(clientPromises);

    // Clean up all sockets
    for (const socket of sockets) {
      socket.destroy();
    }
  }, 30_000);

  it("enforces LRU eviction under heavy concurrent writes without exceeding memory limit", async () => {
    const NUM_CLIENTS = 20;
    const WRITES_PER_CLIENT = 150;
    const payload = "X".repeat(1024); // 1KB per write = 20 * 150 * 1KB ~ 3MB (exceeds 500KB max)

    const sockets: net.Socket[] = [];
    for (let i = 0; i < NUM_CLIENTS; i++) {
      sockets.push(await connect());
    }

    const promises = sockets.map(async (socket, clientIdx) => {
      return new Promise<void>((resolve) => {
        let repliesExpected = WRITES_PER_CLIENT;
        let buffer = "";

        socket.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          while (buffer.includes("\r\n")) {
            const idx = buffer.indexOf("\r\n");
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (line.startsWith("+OK")) {
              repliesExpected--;
              if (repliesExpected === 0) {
                resolve();
              }
            }
          }
        });

        // Pipeline all 150 writes in rapid succession
        for (let w = 0; w < WRITES_PER_CLIENT; w++) {
          socket.write(encodeCommand("SET", `flood:${clientIdx}:${w}`, payload));
        }
      });
    });

    await Promise.all(promises);

    for (const s of sockets) {
      s.destroy();
    }

    // Memory used must stay within or near configured maxMemory (with LRU eviction having taken place)
    expect(stressStore.evictedKeysCount).toBeGreaterThan(0);
    expect(stressStore.usedMemoryBytes).toBeLessThanOrEqual(500 * 1024);
  }, 20_000);
});
