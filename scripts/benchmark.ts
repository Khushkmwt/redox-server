// Simple benchmark — measures ops/sec for PING, SET, and GET.
// Run against a live server: npx tsx scripts/benchmark.ts
//
// Usage:
//   npx tsx --env-file=.env scripts/benchmark.ts
//   PORT=6379 npx tsx scripts/benchmark.ts

import net from "node:net";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 6379);
const ITERATIONS = 10_000;

// ── RESP2 helpers ──────────────────────────────────────────────────────────────

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

// ── Benchmark runner ────────────────────────────────────────────────────────────

function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(PORT, HOST, () => resolve(socket));
    socket.once("error", reject);
  });
}

/**
 * Send `count` commands sequentially (one at a time, await each response).
 * Returns ops/sec.
 */
async function benchmark(
  label: string,
  command: () => Buffer,
  count: number
): Promise<void> {
  const socket = await connect();

  let pending: ((line: string) => void) | null = null;
  let leftover = "";

  socket.on("data", (chunk) => {
    leftover += chunk.toString("utf8");
    const idx = leftover.indexOf("\r\n");
    if (idx !== -1 && pending) {
      const line = leftover.slice(0, idx);
      leftover = leftover.slice(idx + 2);
      const cb = pending;
      pending = null;
      cb(line);
    }
  });

  function send(): Promise<string> {
    return new Promise((resolve) => {
      pending = resolve;
      socket.write(command());
    });
  }

  // Warm up
  for (let i = 0; i < 100; i++) await send();

  const start = performance.now();
  for (let i = 0; i < count; i++) await send();
  const elapsed = performance.now() - start;

  const opsPerSec = Math.round((count / elapsed) * 1000);
  console.log(`${label.padEnd(20)} ${count.toLocaleString()} ops   ${elapsed.toFixed(0).padStart(6)} ms   ${opsPerSec.toLocaleString().padStart(10)} ops/sec`);

  socket.destroy();
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nRedox benchmark — ${HOST}:${PORT}`);
  console.log(`Iterations per command: ${ITERATIONS.toLocaleString()}`);
  console.log(`${"─".repeat(65)}`);
  console.log(`${"Command".padEnd(20)} ${"Ops".padEnd(16)} ${"Time".padEnd(12)} Throughput`);
  console.log(`${"─".repeat(65)}`);

  try {
    await benchmark("PING", () => encodeCommand("PING"), ITERATIONS);
    await benchmark(
      "SET",
      () => encodeCommand("SET", "bench:key", "benchmark-value"),
      ITERATIONS
    );
    await benchmark(
      "GET",
      () => encodeCommand("GET", "bench:key"),
      ITERATIONS
    );
    await benchmark(
      "DEL",
      () => encodeCommand("DEL", "bench:key"),
      ITERATIONS
    );
  } catch (err) {
    console.error(
      `\nFailed to connect to ${HOST}:${PORT} — is the server running?\n`,
      err
    );
    process.exit(1);
  }

  console.log(`${"─".repeat(65)}`);
  console.log(`\nNote: sequential ops (no pipelining). Environment and OS scheduling affect results.\n`);
}

main();
